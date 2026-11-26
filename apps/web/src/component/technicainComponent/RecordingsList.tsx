import { Icon } from './Icons';
export function RecordingsList() {
  return <section className="recordings-card"><div className="recordings-header"><div><h2>My recordings</h2><p>A chronological log of your field observations.</p></div><button className="refresh-button" type="button" onClick={() => window.location.reload()}><Icon name="refresh"/> Refresh</button></div><div className="empty-recordings"><span className="timeline-marker"/><div><strong>No recordings yet</strong><p>Your captured observations will appear here in chronological order once they are saved.</p></div></div><p className="recordings-footnote">Saved recording history will appear here when local storage is connected.</p></section>;
}
