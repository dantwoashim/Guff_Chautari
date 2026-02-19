import React, { useMemo, useState } from 'react';
import {
  getKnowledgeSourceContext,
  ingestKnowledgeFile,
  ingestKnowledgeFromUrl,
  ingestKnowledgeNote,
  listKnowledgeTimeline,
  retrieveKnowledge,
  searchKnowledgeSources,
  synthesizeKnowledgeAnswer,
  type KnowledgeCitation,
  type KnowledgeRetrievalResult,
  type KnowledgeSynthesisResult,
} from '../../knowledge';
import { emitActivityEvent } from '../../activity';

interface KnowledgeWorkbenchPanelProps {
  userId: string;
}

const panelClass =
  'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const normalizeFileText = (file: File, rawText: string): string => {
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (text.length >= 80) return text;

  const fallbackLines = [
    `File: ${file.name}`,
    `Type: ${file.type || 'unknown'}`,
    'Content extraction yielded low text density. Keep this as a source marker and upload a text-rich version for stronger retrieval.',
  ];

  return fallbackLines.join(' ');
};

export const KnowledgeWorkbenchPanel: React.FC<KnowledgeWorkbenchPanelProps> = ({ userId }) => {
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [timelineTerm, setTimelineTerm] = useState('');
  const [timelineType, setTimelineType] = useState<'all' | 'note' | 'file' | 'url'>('all');
  const [query, setQuery] = useState('');
  const [retrieval, setRetrieval] = useState<KnowledgeRetrievalResult | null>(null);
  const [synthesis, setSynthesis] = useState<KnowledgeSynthesisResult | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<KnowledgeCitation | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const timeline = useMemo(() => {
    void refreshTick;
    return listKnowledgeTimeline(
      {
        userId,
        term: timelineTerm,
        type: timelineType,
      }
    );
  }, [refreshTick, timelineTerm, timelineType, userId]);

  const sourceCount = useMemo(() => {
    void refreshTick;
    return searchKnowledgeSources({ userId }).length;
  }, [refreshTick, userId]);

  const selectedCitationContext = useMemo(() => {
    if (!selectedCitation) return null;
    return getKnowledgeSourceContext({
      userId,
      sourceId: selectedCitation.sourceId,
      nodeId: selectedCitation.nodeId,
    });
  }, [selectedCitation, userId]);

  const handleNoteIngest = () => {
    if (!noteText.trim()) {
      setStatus('Note text is required.');
      return;
    }

    const result = ingestKnowledgeNote({
      userId,
      title: noteTitle.trim() || `Note ${new Date().toLocaleString()}`,
      text: noteText,
    });

    setNoteTitle('');
    setNoteText('');
    setRefreshTick((tick) => tick + 1);
    emitActivityEvent({
      userId,
      category: 'knowledge',
      eventType: 'knowledge.note_ingested',
      title: 'Knowledge note ingested',
      description: `Added note source "${result.source.title}" with ${result.nodes.length} chunk(s).`,
    });
    setStatus(`Ingested note "${result.source.title}" with ${result.nodes.length} chunk(s).`);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList) as File[];

    setIsBusy(true);
    try {
      let processed = 0;
      for (const file of files) {
        const rawText = await file.text();
        const text = normalizeFileText(file, rawText);
        ingestKnowledgeFile({
          userId,
          title: file.name,
          text,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        emitActivityEvent({
          userId,
          category: 'knowledge',
          eventType: 'knowledge.file_ingested',
          title: 'Knowledge file ingested',
          description: `Added file source "${file.name}".`,
        });
        processed += 1;
      }

      setRefreshTick((tick) => tick + 1);
      setStatus(`Ingested ${processed} file source(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'File ingestion failed.');
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  };

  const handleUrlIngest = async () => {
    const url = urlInput.trim();
    if (!url) {
      setStatus('URL is required.');
      return;
    }

    setIsBusy(true);
    try {
      const result = await ingestKnowledgeFromUrl({
        userId,
        url,
      });

      setUrlInput('');
      setRefreshTick((tick) => tick + 1);
      emitActivityEvent({
        userId,
        category: 'knowledge',
        eventType: 'knowledge.url_ingested',
        title: 'Knowledge URL ingested',
        description: `Fetched and indexed "${result.source.title}".`,
      });
      setStatus(`Ingested URL "${result.source.title}" with ${result.nodes.length} chunk(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'URL ingestion failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuery = () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setStatus('Query is required.');
      return;
    }

    const retrievalResult = retrieveKnowledge({
      userId,
      query: normalizedQuery,
      topK: 6,
    });
    const synthesisResult = synthesizeKnowledgeAnswer(retrievalResult);

    setRetrieval(retrievalResult);
    setSynthesis(synthesisResult);
    setSelectedCitation(synthesisResult.citations[0] ?? null);
    emitActivityEvent({
      userId,
      category: 'knowledge',
      eventType: 'knowledge.query_executed',
      title: 'Knowledge query executed',
      description: `Query "${normalizedQuery}" returned ${retrievalResult.hits.length} hit(s).`,
    });
    setStatus(
      retrievalResult.hits.length > 0
        ? `Retrieved ${retrievalResult.hits.length} knowledge hit(s).`
        : 'No retrieval hits yet. Add more sources.'
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Knowledge Workbench</h2>
            <p className="text-sm text-[#8696a0]">
              Ingest notes/files/links, retrieve top-k knowledge, and synthesize cited answers.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{sourceCount} source(s)</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Add Note</h3>
            <input
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="Title"
              className="mb-2 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Paste or type notes..."
              className="h-28 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <button
              type="button"
              className="mt-2 rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={handleNoteIngest}
              disabled={isBusy}
            >
              Ingest Note
            </button>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Add File</h3>
            <label className="flex h-28 cursor-pointer items-center justify-center rounded border border-dashed border-[#3e4b55] bg-[#0f171c] px-3 text-center text-xs text-[#8ea1ab] hover:border-[#5b7a87]">
              Drag/drop or click to upload .txt/.md/.pdf
              <input
                type="file"
                className="hidden"
                multiple
                accept=".txt,.md,.pdf,text/plain,application/pdf"
                onChange={handleFileUpload}
              />
            </label>
            <p className="mt-2 text-xs text-[#8ea1ab]">
              PDF support uses lightweight text extraction. For scanned PDFs, upload OCR text for best retrieval.
            </p>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Add URL</h3>
            <input
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              placeholder="https://example.com/article"
              className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <button
              type="button"
              className="mt-2 rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={() => {
                void handleUrlIngest();
              }}
              disabled={isBusy}
            >
              Fetch + Ingest URL
            </button>
            <p className="mt-2 text-xs text-[#8ea1ab]">
              If a site blocks fetch (CORS), use note/file ingestion with the copied text.
            </p>
          </section>
        </div>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Retrieve + Synthesize</h3>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask using your knowledge base..."
              className="flex-1 rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <button
              type="button"
              className="rounded border border-[#00a884] px-3 py-2 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={handleQuery}
            >
              Query
            </button>
          </div>

          {synthesis ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-[#27343d] bg-[#0f171c] p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-[#8ea1ab]">Answer</div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-[#dfe7eb]">{synthesis.answer}</pre>
              </div>

              <div className="rounded-lg border border-[#27343d] bg-[#0f171c] p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-[#8ea1ab]">Citations</div>
                <div className="space-y-2">
                  {synthesis.citations.map((citation) => (
                    <button
                      key={citation.nodeId}
                      type="button"
                      className={`w-full rounded border px-2 py-2 text-left text-xs transition ${
                        selectedCitation?.nodeId === citation.nodeId
                          ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                          : 'border-[#313d45] bg-[#111b21] text-[#9fb0ba] hover:border-[#4a5961]'
                      }`}
                      onClick={() => setSelectedCitation(citation)}
                    >
                      <div>{citation.marker}</div>
                      <div className="mt-1 line-clamp-2">{citation.snippet}</div>
                    </button>
                  ))}
                </div>

                {selectedCitation && selectedCitationContext ? (
                  <div className="mt-3 rounded border border-[#2a3a44] bg-[#111b21] p-2 text-xs text-[#c3d0d7]">
                    <div className="mb-1 font-medium text-[#e9edef]">{selectedCitationContext.title}</div>
                    <div>{selectedCitationContext.chunkText || selectedCitationContext.text}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {retrieval ? (
            <div className="mt-3 rounded-lg border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#9fb0ba]">
              Formula: {retrieval.formula}
            </div>
          ) : null}
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Knowledge Timeline</h3>
          <div className="mb-3 flex gap-2">
            <input
              value={timelineTerm}
              onChange={(event) => setTimelineTerm(event.target.value)}
              placeholder="Search timeline"
              className="flex-1 rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <select
              value={timelineType}
              onChange={(event) => setTimelineType(event.target.value as 'all' | 'note' | 'file' | 'url')}
              className="rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#dfe7eb]"
            >
              <option value="all">All</option>
              <option value="note">Notes</option>
              <option value="file">Files</option>
              <option value="url">URLs</option>
            </select>
          </div>

          <div className="space-y-2">
            {timeline.length === 0 ? (
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No sources yet.
              </div>
            ) : (
              timeline.map((item) => (
                <div key={item.sourceId} className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[#e9edef]">{item.title}</div>
                    <div className="text-xs uppercase tracking-wide text-[#7f929c]">{item.type}</div>
                  </div>
                  <div className="mt-1 text-xs text-[#9fb0ba]">{item.preview}</div>
                  <div className="mt-2 text-[11px] text-[#738892]">
                    {new Date(item.createdAtIso).toLocaleString()} • {item.nodeCount} chunk(s)
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default KnowledgeWorkbenchPanel;
