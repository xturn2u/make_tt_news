import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardPaste, FileJson2, Trash2 } from 'lucide-react';
import { importNewsPackage } from '../../domain/importPackage';
import { useProject } from '../../project/ProjectContext';

export function JsonInputPanel() {
  const { newsPackage, setNewsPackage } = useProject();
  const [text, setText] = useState(() => newsPackage ? JSON.stringify({ package: newsPackage }, null, 2) : '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const preview = useMemo(() => newsPackage ? `${newsPackage.meta.topic} · 3 Versionen` : 'Noch kein Paket geladen', [newsPackage]);

  async function paste() {
    try {
      const value = await navigator.clipboard.readText();
      if (value) setText(value);
    } catch {
      setError('Zwischenablage konnte nicht gelesen werden. Bitte JSON manuell einfügen.');
    }
  }

  function apply() {
    setMessage(''); setError('');
    try {
      const pkg = importNewsPackage(text);
      setNewsPackage(pkg);
      setMessage(`Importiert: ${pkg.meta.topic}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return <div className="module-stack">
    <div className="module-intro"><FileJson2/><div><h2>JSON Input</h2><p>Einziger Eingang in den Produktionsflow. Akzeptiert das Newspaket direkt oder den API-Body mit <code>package</code>.</p></div></div>
    <div className="json-toolbar">
      <button className="secondary" onClick={paste}><ClipboardPaste size={16}/> Einfügen</button>
      <span className={newsPackage ? 'inline-state ok' : 'inline-state'}>{newsPackage ? <CheckCircle2 size={15}/> : null}{preview}</span>
    </div>
    <textarea className="json-editor" spellCheck={false} value={text} onChange={(event)=>setText(event.target.value)} placeholder={'{\n  "package": {\n    "source_url": "https://…",\n    "meta": { "topic": "…", "breaking": false },\n    "versions": { "v1": {}, "v2": {}, "v3": {} }\n  }\n}'} />
    <div className="action-row">
      <button className="primary" onClick={apply}>JSON übernehmen</button>
      {newsPackage && <button className="danger-ghost" onClick={()=>{setNewsPackage(null);setMessage('');setText('');}}><Trash2 size={15}/> Paket entfernen</button>}
    </div>
    {message && <div className="notice success">{message}</div>}
    {error && <div className="notice error">{error}</div>}
  </div>;
}
