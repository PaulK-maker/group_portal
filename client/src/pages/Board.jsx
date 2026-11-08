import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Board() {
  const { groupId, canPost } = useAuth();
  const [data, setData] = useState({ posts: [], events: [] });
  const [filter, setFilter] = useState('all');
  const [post, setPost] = useState({ type: 'announcement', title: '', body: '', attachmentUrl: '', pinned: false });
  const [event, setEvent] = useState({ title: '', startsAt: '', location: '', description: '' });
  const [error, setError] = useState('');
  const base = `/groups/${groupId}/board`;

  const load = useCallback(() => api(base).then(setData).catch((e) => setError(e.message)), [base]);
  useEffect(() => { load(); }, [load]);

  const submit = (path, body, reset) => async (e) => {
    e.preventDefault();
    setError('');
    try { await api(`${base}/${path}`, { method: 'POST', body }); reset(); load(); }
    catch (err) { setError(err.message); }
  };
  const remove = async (path) => {
    if (!window.confirm('Delete this?')) return;
    await api(`${base}/${path}`, { method: 'DELETE' });
    load();
  };

  const posts = data.posts.filter((p) => filter === 'all' || p.type === filter);

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="row-between">
          <h2>Announcements & minutes</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="announcement">Announcements</option>
            <option value="minutes">Minutes</option>
          </select>
        </div>
        {posts.map((p) => (
          <article key={p._id} className="post">
            <div className="row-between">
              <h3>{p.pinned && '📌 '}{p.title} <span className="tag">{p.type}</span></h3>
              {canPost && <button className="link" onClick={() => remove(`posts/${p._id}`)}>Delete</button>}
            </div>
            <div className="small muted">{p.author?.name} · {fmtDate(p.createdAt)}</div>
            {p.body && <p className="body">{p.body}</p>}
            {p.attachmentUrl && <a href={p.attachmentUrl} target="_blank" rel="noreferrer">Open attachment</a>}
          </article>
        ))}
        {!posts.length && <p className="muted">Nothing here yet.</p>}
      </section>

      <section className="card">
        <h2>Upcoming events</h2>
        <ul className="list">
          {data.events.map((e) => (
            <li key={e._id}>
              <span><strong>{e.title}</strong>{e.location && ` · ${e.location}`}{e.description && <div className="small muted">{e.description}</div>}</span>
              <span>{new Date(e.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                {canPost && <button className="link" onClick={() => remove(`events/${e._id}`)}> ✕</button>}
              </span>
            </li>
          ))}
          {!data.events.length && <li className="muted">No upcoming events.</li>}
        </ul>
      </section>

      {canPost && (
        <div className="grid">
          <form className="card" onSubmit={submit('posts', post, () => setPost({ ...post, title: '', body: '', attachmentUrl: '', pinned: false }))}>
            <h2>New post</h2>
            <label>Type
              <select value={post.type} onChange={(e) => setPost({ ...post, type: e.target.value })}>
                <option value="announcement">Announcement</option>
                <option value="minutes">Meeting minutes</option>
              </select>
            </label>
            <label>Title<input required value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} /></label>
            <label>Text<textarea rows="6" value={post.body} onChange={(e) => setPost({ ...post, body: e.target.value })} /></label>
            <label>Link to file (optional)<input value={post.attachmentUrl} onChange={(e) => setPost({ ...post, attachmentUrl: e.target.value })} /></label>
            <label className="inline small"><input type="checkbox" checked={post.pinned} onChange={(e) => setPost({ ...post, pinned: e.target.checked })} /> Pin to top</label>
            <button>Post</button>
          </form>

          <form className="card" onSubmit={submit('events', event, () => setEvent({ title: '', startsAt: '', location: '', description: '' }))}>
            <h2>New event</h2>
            <label>Title<input required value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} /></label>
            <label>Date & time<input required type="datetime-local" value={event.startsAt} onChange={(e) => setEvent({ ...event, startsAt: e.target.value })} /></label>
            <label>Location<input value={event.location} onChange={(e) => setEvent({ ...event, location: e.target.value })} /></label>
            <label>Details<textarea rows="3" value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} /></label>
            <button>Add event</button>
          </form>
        </div>
      )}
    </div>
  );
}
