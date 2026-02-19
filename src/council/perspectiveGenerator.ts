import type {
  CouncilPerspectiveStyle,
  GeneratePerspectivesInput,
  PerspectiveResponse,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const styleOrder: ReadonlyArray<CouncilPerspectiveStyle> = [
  'analytical',
  'empathetic',
  'skeptical',
  'creative',
  'execution_focused',
];

const styleToActionBias: Record<CouncilPerspectiveStyle, string> = {
  analytical: 'Define constraints, score options, and commit based on measurable upside.',
  empathetic: 'Optimize for human impact and emotional sustainability before speed.',
  skeptical: 'Stress-test assumptions and keep downside protection as a hard gate.',
  creative: 'Explore non-obvious combinations that open a higher-upside path.',
  execution_focused: 'Pick one path and ship a concrete first milestone within 48 hours.',
};

const styleToFrame: Record<CouncilPerspectiveStyle, string> = {
  analytical:
    'I would structure this with explicit criteria, weighted tradeoffs, and a verification loop.',
  empathetic:
    'I would center the decision around trust, motivation, and long-term relationship effects.',
  skeptical:
    'I would challenge optimistic assumptions first and isolate irreversible downside.',
  creative:
    'I would search for a hybrid path that captures upside from multiple options.',
  execution_focused:
    'I would collapse this into a short execution plan with clear owner and deadline.',
};

const inferStyle = (seed: number, occupied: ReadonlyArray<CouncilPerspectiveStyle>): CouncilPerspectiveStyle => {
  const candidate = styleOrder[seed % styleOrder.length];
  if (!occupied.includes(candidate)) return candidate;

  for (const style of styleOrder) {
    if (!occupied.includes(style)) return style;
  }
  return candidate;
};

const buildPerspectiveText = (params: {
  memberName: string;
  roleHint?: string;
  style: CouncilPerspectiveStyle;
  prompt: string;
}): string => {
  const roleNote = params.roleHint ? `${params.roleHint}. ` : '';
  const actionBias = styleToActionBias[params.style];

  return [
    `${params.memberName}: ${roleNote}${styleToFrame[params.style]}`,
    `Prompt focus: ${params.prompt}`,
    `Action bias: ${actionBias}`,
  ].join('\n');
};

export const generateSequentialPerspectives = async (
  input: GeneratePerspectivesInput
): Promise<PerspectiveResponse[]> => {
  const now = Date.parse(input.nowIso ?? new Date().toISOString());
  const stylesUsed: CouncilPerspectiveStyle[] = [];
  const perspectives: PerspectiveResponse[] = [];

  for (let index = 0; index < input.council.members.length; index += 1) {
    const member = input.council.members[index];
    const style = inferStyle(member.stanceSeed + index, stylesUsed);
    stylesUsed.push(style);

    const startedAt = now + index * 14;
    const durationMs = 220 + ((member.stanceSeed + index) % 230);
    const createdAtIso = new Date(startedAt + durationMs).toISOString();

    perspectives.push({
      id: makeId('perspective'),
      councilId: input.council.id,
      memberId: member.id,
      memberName: member.name,
      style,
      prompt: input.prompt,
      response: buildPerspectiveText({
        memberName: member.name,
        roleHint: member.roleHint,
        style,
        prompt: input.prompt,
      }),
      actionBias: styleToActionBias[style],
      createdAtIso,
      durationMs,
    });
  }

  return perspectives;
};
