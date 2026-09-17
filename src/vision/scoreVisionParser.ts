import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { config, isVisionEnabled } from '../config';
import type { Game } from '../domain/types';

/**
 * Reads a game's final score off a screenshot using Claude's vision +
 * structured outputs, rather than hand-rolled OCR/regex. This is more
 * robust to screenshot cropping, theme, and phone-vs-desktop layout
 * differences than a fixed-position text extraction would be.
 */

const ScoreExtractionSchema = z.object({
  game: z.enum(['timeguesser', 'speedquiz', 'unknown']),
  score: z.number().int().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
});

export interface VisionScoreResult {
  game: Game | 'unknown';
  score: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export class VisionDisabledError extends Error {
  constructor() {
    super('Screenshot reading is not configured (ANTHROPIC_API_KEY is not set).');
    this.name = 'VisionDisabledError';
  }
}

const SYSTEM_PROMPT = `You read screenshots that a friend group posts into a Teams chat to log their \
daily scores from two games:

- **TimeGuesser** (also styled TimeGuessr) - a daily geography-and-history guessing game. Across \
five rounds, the player is shown a photo and guesses its year and location; the results/share \
screen shows a final total score, commonly out of 50,000, and often round-by-round breakdowns \
with year and distance guesses. The name "TimeGuessr" or "TimeGuesser" is often visible on the \
results screen.
- **Speed Quiz** - a daily speed-based quiz game. Its results screen shows a final points or score \
total, and may show time taken or number of correct answers.

Given one screenshot, decide which of these two games it is (or "unknown" if it's clearly neither \
or you can't tell), and extract the single final score shown for that result. Only report a score \
you can actually see written on the screen - never estimate or infer one. If the image is blurry, \
cropped before the score is visible, shows something unrelated, or you are genuinely unsure, set \
score to null and confidence to "low" rather than guessing. Use "medium" confidence when you found \
a plausible score but the image quality, an ambiguous layout, or a competing number (e.g. a round \
score next to a total) makes you less than fully sure it's the right one. Briefly explain your \
reasoning in one or two sentences.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/** Narrows an attachment's contentType down to a media type Claude's vision input accepts. */
export function toSupportedImageMediaType(contentType: string | undefined): string {
  const supported = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const normalized = (contentType || '').toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return supported.has(normalized) ? normalized : 'image/png';
}

export async function parseScoreFromScreenshot(
  imageBase64: string,
  mediaType: string,
): Promise<VisionScoreResult> {
  if (!isVisionEnabled()) {
    throw new VisionDisabledError();
  }

  const anthropic = getClient();
  const response = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1024,
    output_config: {
      effort: 'low',
      format: zodOutputFormat(ScoreExtractionSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Identify the game and extract the final score shown in this screenshot.',
          },
        ],
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error('Claude returned a response that did not match the expected score format.');
  }
  return response.parsed_output;
}
