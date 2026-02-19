import React, { useMemo } from 'react';
import { critiqueWritingSample } from '../../../verticals/research/critiqueEngine';

interface SourceItem {
  id: string;
  title: string;
  annotationStatus: 'pending' | 'in_progress' | 'completed';
}

interface ResearchQuestion {
  id: string;
  question: string;
  linkedQuery: string;
}

interface WritingProgress {
  id: string;
  section: string;
  wordCount: number;
  citationCount: number;
  completion: number;
}

interface SynthesisTask {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
}

interface ResearchDashboardPanelProps {
  userId: string;
  sources?: SourceItem[];
  questions?: ResearchQuestion[];
  writingProgress?: WritingProgress[];
  synthesisQueue?: SynthesisTask[];
  sampleDraft?: string;
}

const defaultSources: SourceItem[] = [
  {
    id: 'src-1',
    title: 'Memory consolidation architectures for LLM systems',
    annotationStatus: 'completed',
  },
  {
    id: 'src-2',
    title: 'User trust calibration in AI copilots',
    annotationStatus: 'in_progress',
  },
  {
    id: 'src-3',
    title: 'Benchmark reproducibility for conversational agents',
    annotationStatus: 'pending',
  },
];

const defaultQuestions: ResearchQuestion[] = [
  {
    id: 'q-1',
    question: 'Which retrieval signal weighting gives stable recall under noisy history?',
    linkedQuery: 'retrieval signal weighting recall stability',
  },
  {
    id: 'q-2',
    question: 'How does persona drift correlate with prompt tier size?',
    linkedQuery: 'persona drift prompt tier size relationship',
  },
];

const defaultProgress: WritingProgress[] = [
  {
    id: 'w-1',
    section: 'Introduction',
    wordCount: 820,
    citationCount: 8,
    completion: 0.78,
  },
  {
    id: 'w-2',
    section: 'Methods',
    wordCount: 560,
    citationCount: 5,
    completion: 0.52,
  },
  {
    id: 'w-3',
    section: 'Discussion',
    wordCount: 340,
    citationCount: 2,
    completion: 0.31,
  },
];

const defaultSynthesisQueue: SynthesisTask[] = [
  {
    id: 'sq-1',
    title: 'Compare methodologies across top 5 papers',
    priority: 'high',
  },
  {
    id: 'sq-2',
    title: 'Draft citation map for discussion claims',
    priority: 'medium',
  },
];

const badgeClass = (status: SourceItem['annotationStatus']): string => {
  if (status === 'completed') return 'bg-emerald-900/50 text-emerald-200 border-emerald-800';
  if (status === 'in_progress') return 'bg-amber-900/50 text-amber-200 border-amber-800';
  return 'bg-slate-800 text-slate-200 border-slate-700';
};

const priorityClass = (priority: SynthesisTask['priority']): string => {
  if (priority === 'high') return 'text-rose-300';
  if (priority === 'medium') return 'text-amber-300';
  return 'text-slate-300';
};

export const ResearchDashboardPanel: React.FC<ResearchDashboardPanelProps> = ({
  userId,
  sources = defaultSources,
  questions = defaultQuestions,
  writingProgress = defaultProgress,
  synthesisQueue = defaultSynthesisQueue,
  sampleDraft,
}) => {
  const critique = useMemo(() => {
    return critiqueWritingSample({
      text:
        sampleDraft ??
        'This study suggests retrieval strategy strongly influences memory recall [Smith, 2024]. Therefore, we compare weighting variants across controlled prompts. The system demonstrates improved consistency but the claim requires broader replication.',
    });
  }, [sampleDraft]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">Research Dashboard</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            Active research and writing state for user <span className="font-mono text-[#7ed0f3]">{userId}</span>.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Source Library</h3>
            <ul className="space-y-2">
              {sources.map((source) => (
                <li key={source.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <p className="text-sm text-[#d7e1e7]">{source.title}</p>
                  <span className={`mt-2 inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${badgeClass(source.annotationStatus)}`}>
                    {source.annotationStatus.replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Active Research Questions</h3>
            <ul className="space-y-2 text-sm text-[#d7e1e7]">
              {questions.map((item) => (
                <li key={item.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <p>{item.question}</p>
                  <p className="mt-1 text-xs text-[#8fa3af]">Knowledge query: {item.linkedQuery}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Writing Progress</h3>
            <ul className="space-y-2">
              {writingProgress.map((section) => (
                <li key={section.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <div className="mb-1 flex items-center justify-between text-sm text-[#d7e1e7]">
                    <span>{section.section}</span>
                    <span>{Math.round(section.completion * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#24333c]">
                    <div className="h-full bg-[#7ed0f3]" style={{ width: `${Math.round(section.completion * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-[#8fa3af]">
                    {section.wordCount} words • {section.citationCount} citations
                  </p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Synthesis Queue</h3>
            <ul className="space-y-2 text-sm text-[#d7e1e7]">
              {synthesisQueue.map((task) => (
                <li key={task.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <p>{task.title}</p>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${priorityClass(task.priority)}`}>
                    {task.priority} priority
                  </p>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Writing Critique Snapshot</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-[#27343d] bg-[#0f171d] p-3 text-sm text-[#d7e1e7]">
              <p className="text-xs text-[#8fa3af]">Argument Structure</p>
              <p className="text-lg font-semibold">{Math.round(critique.scores.argumentStructure * 100)}%</p>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171d] p-3 text-sm text-[#d7e1e7]">
              <p className="text-xs text-[#8fa3af]">Citation Strength</p>
              <p className="text-lg font-semibold">{Math.round(critique.scores.citationStrength * 100)}%</p>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171d] p-3 text-sm text-[#d7e1e7]">
              <p className="text-xs text-[#8fa3af]">Clarity</p>
              <p className="text-lg font-semibold">{Math.round(critique.scores.clarity * 100)}%</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-[#aebac1]">{critique.summary}</p>
        </section>
      </div>
    </div>
  );
};
