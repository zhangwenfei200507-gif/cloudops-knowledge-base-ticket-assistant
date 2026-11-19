import React, { useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, BookOpen, Check, CircleAlert, Copy, ExternalLink, FileText, LogOut, Paperclip,
  Search, Server, Ticket, X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askAiQuestion } from './api/admin';
import { createSupportTicket } from './api/support';
import { CloudOpsMark } from './SignIn';

const suggestions = [
  { icon: Server, label: 'Investigate an incident', question: 'How should I investigate an increase in API 5xx errors after a deploy?' },
  { icon: BookOpen, label: 'Find a runbook', question: 'What does the production rollback runbook say to check before a rollback?' },
  { icon: FileText, label: 'Review a configuration', question: 'What should I check before changing a Redis connection timeout?' },
];

const sourceLabels = {
  ARTICLE: 'Knowledge pack',
  DOCUMENT: 'Source document',
  WEB: 'Web reference',
  WEB_EVIDENCE: 'Web reference',
  AI_ONLY: 'AI analysis',
};

const answerLabels = {
  INTERNAL_RAG: 'Internal knowledge',
  WEB_SEARCH: 'Web evidence',
  AI_ASSISTED_WEB: 'Web-assisted answer',
  AI_ONLY: 'AI analysis',
};

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function evidenceFor(answer) {
  if (!answer) return [];
  if (Array.isArray(answer.sources) && answer.sources.length) return answer.sources;
  return answer.sourceArticleId || answer.sourceDocumentId || answer.sourceUrl || answer.sourceTitle || answer.sourceDocumentName
    ? [answer]
    : [];
}

const markdownComponents = {
  table: ({ node, ...props }) => <div className="supportAnswerTable"><table {...props} /></div>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
};

function SupportEvidence({ answer, unavailable }) {
  const sources = evidenceFor(answer);
  return (
    <aside className="supportEvidence" id="support-evidence-panel" aria-labelledby="support-evidence-title">
      <header><span><BookOpen size={22} aria-hidden="true" /></span><div><h2 id="support-evidence-title">Evidence</h2><p>{answer && sources.length ? `${sources.length} ${sources.length === 1 ? 'reference' : 'references'}` : 'References used by the assistant'}</p></div></header>
      {sources.length ? (
        <ol className="supportEvidenceList">
          {sources.map((source, index) => {
            const sourceUrl = safeExternalUrl(source.sourceUrl);
            const title = source.sourceTitle || source.sourceDocumentName || source.sourceDomain || `Reference ${index + 1}`;
            return (
              <li key={`${source.sourceArticleId || source.sourceDocumentId || source.sourceWebEvidenceId || title}-${index}`}>
                <span className="supportEvidenceIndex">{index + 1}</span>
                <div>
                  <small>{sourceLabels[source.sourceType] || 'Reference'}{source.sourceDomain && ` · ${source.sourceDomain}`}</small>
                  {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{title} <ExternalLink size={13} aria-hidden="true" /></a> : <strong>{title}</strong>}
                  {source.previewContent && <p>{source.previewContent}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="supportEvidenceEmpty">
          <strong>{!answer ? 'Ask to find references' : 'No references returned'}</strong>
          <p>{!answer ? 'Runbooks, uploaded documents, and web references will appear here when the assistant uses them.' : unavailable ? 'Add a document or more detail to help the assistant find supporting evidence.' : 'Verify the answer before acting on it.'}</p>
        </div>
      )}
    </aside>
  );
}

function TicketDraft({ question, onClose, onCreated }) {
  const [title, setTitle] = useState(question.slice(0, 100));
  const [description, setDescription] = useState(question);
  const [priority, setPriority] = useState('MEDIUM');
  const [status, setStatus] = useState(null);
  const posting = useRef(false);

  const submit = async (event) => {
    event.preventDefault();
    if (posting.current || !title.trim() || !description.trim()) return;
    posting.current = true;
    setStatus({ type: 'pending' });
    try {
      await createSupportTicket({ title: title.trim(), description: description.trim(), priority });
      onCreated();
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      posting.current = false;
    }
  };

  return (
    <form className="supportDraft" onSubmit={submit} aria-labelledby="support-draft-title">
      <div className="supportDraftHeading"><Ticket size={20} aria-hidden="true" /><h3 id="support-draft-title">Review ticket draft</h3></div>
      <p>Include the impact and any troubleshooting steps that will help the support team.</p>
      <fieldset disabled={status?.type === 'pending'}>
        <label htmlFor="ticket-title">Title</label>
        <input id="ticket-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required autoFocus />
        <label htmlFor="ticket-description">Description</label>
        <textarea id="ticket-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required />
        <label htmlFor="ticket-priority">Priority</label>
        <select id="ticket-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
        </select>
        <div className="supportDraftActions">
          <button type="button" className="supportSecondary" onClick={onClose}>Cancel draft</button>
          <button type="submit" className="supportPrimary" disabled={!title.trim() || !description.trim()}><Ticket size={16} aria-hidden="true" />{status?.type === 'pending' ? 'Creating ticket…' : 'Create ticket'}</button>
        </div>
      </fieldset>
      {status?.type === 'error' && <p className="supportAlert" role="alert">{status.message}</p>}
    </form>
  );
}

export default function SupportWorkspace({ user, onSignOut }) {
  const name = user.displayName || user.username || 'Workspace user';
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [fileError, setFileError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef(null);
  const questionInput = useRef(null);
  const posting = useRef(false);


  const openQuestion = (text) => {
    setQuestion(text);
    setRequestError('');
    questionInput.current.focus();
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion || posting.current || draftOpen) return;
    posting.current = true;
    setSubmitting(true);
    setRequestError('');
    setCopyStatus('');
    setResult(null);
    setTicketSent(false);
    try {
      const answer = await askAiQuestion({ question: submittedQuestion, file });
      if (!answer) throw new Error('The assistant returned no answer. Try again.');
      setResult({ answer, question: submittedQuestion, filename: file?.name });
      setQuestion('');
      clearFile();
    } catch (error) {
      setRequestError(error.message || 'The assistant could not complete this request. Try again.');
    } finally {
      posting.current = false;
      setSubmitting(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null;
    if (selected && selected.size > 10 * 1024 * 1024) {
      clearFile();
      setFileError('The file exceeds 10 MB. Attach a smaller file or continue without it.');
      return;
    }
    setFileError('');
    setFile(selected);
  };

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(result.answer.answer);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Select the answer text to copy it manually.');
    }
  };

  const answer = result?.answer;
  const unavailable = Boolean(answer && (!answer.answer?.trim() || [answer.answerMode, answer.sourceType].some((value) => String(value).toUpperCase() === 'NONE')));
  const answerLabel = answerLabels[answer?.answerMode] || sourceLabels[answer?.sourceType];
  const canDraft = Boolean(answer && !answer.createdTicketId && !ticketSent);
  const closeDraft = () => {
    setDraftOpen(false);
    requestAnimationFrame(() => questionInput.current?.focus());
  };

  const composer = (
    <form className="supportComposer" onSubmit={submitQuestion}>
      <label htmlFor="support-question">{result ? 'Ask a follow-up question' : 'Your question'}</label>
      <textarea id="support-question" ref={questionInput} rows={3} placeholder="Describe the issue or ask what to check next…" maxLength={4000} required value={question} disabled={submitting || draftOpen} onChange={(event) => setQuestion(event.target.value)} />
      {result && <p className="supportInputHint">Include any details needed to understand the follow-up.</p>}
      <div className="supportComposerFooter">
        <div className="supportAttachments">
          <label className="supportAttachButton"><Paperclip size={17} aria-hidden="true" />{file ? 'Change file' : 'Attach a file'}
            <input aria-label={file ? 'Change file' : 'Attach a file'} ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,.markdown" onChange={chooseFile} disabled={submitting || draftOpen} />
          </label>
          {file ? <span className="supportFile"><span title={file.name}>{file.name}</span><button type="button" onClick={clearFile} disabled={submitting || draftOpen} aria-label="Remove attachment"><X size={15} /></button></span>
            : <span className="supportInputHint">PDF, DOCX, TXT, MD up to 10 MB</span>}
        </div>
        <button className="supportPrimary" type="submit" disabled={!question.trim() || submitting || draftOpen}>{submitting ? 'Finding an answer…' : 'Ask CloudOps'}<ArrowRight size={17} aria-hidden="true" /></button>
      </div>
      {(requestError || fileError) && <p className="supportAlert" role="alert"><CircleAlert size={17} aria-hidden="true" />{fileError || requestError}</p>}
    </form>
  );

  return (
    <main className="supportShell">
      <header className="supportTopbar">
        <div className="supportTopbarInner">
          <div className="supportBrand"><CloudOpsMark /><strong>CloudOps</strong><span>Support workspace</span></div>
          <div className="supportAccount"><span className="supportAvatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><span>{name}</span><button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button></div>
        </div>
      </header>
      <div className="supportMain">
        <div className="supportHero">
          <span className="supportHeroIcon"><Search size={24} aria-hidden="true" /></span>
          <div><h1>Investigate an issue</h1><p>Ask about a CloudOps incident, a runbook, or a document you attach.</p></div>
        </div>
        <div className="supportGrid">
          <div className="supportThread">
            {!result && composer}

            {!result && !submitting && !requestError && (
              <section className="supportExamples" aria-labelledby="support-examples-title">
                <h2 id="support-examples-title">Suggested questions</h2>
                <div>{suggestions.map(({ icon: Icon, label, question: example }) => <button type="button" key={label} onClick={() => openQuestion(example)}><Icon size={18} aria-hidden="true" /><span>{label}</span><ArrowRight size={15} aria-hidden="true" /></button>)}</div>
              </section>
            )}
            {submitting && <div className="supportLoading" role="status">Searching for supporting evidence…</div>}
            {result && (
              <section className={`supportAnswer ${unavailable ? 'insufficient' : ''}`} aria-labelledby="support-answer-title">
                <div className="supportAsked"><span>Asked</span><strong>{result.question}</strong>{result.filename && <small><Paperclip size={14} aria-hidden="true" />{result.filename}</small>}</div>
                <div className="supportAnswerBody">
                  <div className="supportAnswerHeading">
                    <div className="supportAnswerTitle"><span>{unavailable ? <CircleAlert size={19} aria-hidden="true" /> : <BookOpen size={19} aria-hidden="true" />}</span><h2 id="support-answer-title" aria-live="polite">{unavailable ? 'Insufficient evidence' : 'Answer'}</h2></div>
                    {!unavailable && answerLabel && <span className="supportMode">{answerLabel}</span>}
                    {evidenceFor(answer).length > 0 && <a className="supportEvidenceJump" href="#support-evidence-panel">See evidence</a>}
                    {!unavailable && answer.answer && <button className="supportCopy" type="button" onClick={copyAnswer}><Copy size={15} aria-hidden="true" />{copyStatus === 'Copied' ? 'Copied' : 'Copy'}</button>}
                  </div>
                  {copyStatus && <p className="supportCopyStatus" role="status">{copyStatus}</p>}
                  <div className="supportMarkdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{answer.answer || (unavailable ? 'The assistant could not find enough evidence to answer this question.' : '')}</ReactMarkdown></div>
                  {answer.createdTicketId && <div className="supportTicketSent" role="status"><Check size={20} aria-hidden="true" /><strong>Support ticket #{answer.createdTicketId} created</strong></div>}
                </div>
                <div className="supportNext">
                  <p>{unavailable ? 'Add context or send the issue to support.' : 'Still investigating?'}</p>
                  <button type="button" className="supportSecondary" onClick={() => questionInput.current.focus()} disabled={draftOpen}>Ask a follow-up <ArrowDown size={14} aria-hidden="true" /></button>
                  {canDraft && !draftOpen && <button type="button" className="supportSecondary" onClick={() => setDraftOpen(true)}><Ticket size={16} aria-hidden="true" />Draft a ticket</button>}
                </div>
                {draftOpen && <TicketDraft question={result.question} onClose={closeDraft} onCreated={() => { setTicketSent(true); setDraftOpen(false); }} />}
                {ticketSent && <div className="supportTicketSent" role="status"><Check size={20} aria-hidden="true" /><div><strong>Support ticket created</strong><p>The support team can now review it in the ticket queue.</p></div></div>}
              </section>
            )}
            {result && composer}
          </div>
          <SupportEvidence answer={answer} unavailable={unavailable} />
        </div>
      </div>
    </main>
  );
}
