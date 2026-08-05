'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  type CalendarEvent,
  type Channel,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
} from '@/lib/api';

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function CalendarPanel({
  channels,
  currentUserId,
  onClose,
}: {
  channels: Channel[];
  currentUserId: string | null;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [visibility, setVisibility] = useState<'PERSONAL' | 'GENERAL'>('PERSONAL');
  const [channelId, setChannelId] = useState('');

  const publicChannels = channels.filter((c) => c.type === 'TEXT' && !c.isPrivate);

  useEffect(() => {
    fetchCalendarEvents().then(setEvents);
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dateKey(new Date(event.date));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();
  const days: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !selectedDay) return;
    if (visibility === 'GENERAL' && !channelId) return;
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date(selectedDay);
    date.setHours(hours || 0, minutes || 0, 0, 0);

    const event = await createCalendarEvent({
      title: title.trim(),
      date: date.toISOString(),
      visibility,
      channelId: visibility === 'GENERAL' ? channelId : undefined,
    });
    setEvents((prev) => [...prev, event]);
    setTitle('');
  }

  async function handleDelete(id: string) {
    await deleteCalendarEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  const selectedDayEvents = selectedDay ? (eventsByDay.get(dateKey(selectedDay)) ?? []) : [];

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-term-overlay p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded border border-term-line bg-term-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-term-green-bright">Calendar</h2>
          <button onClick={onClose} className="text-term-muted hover:text-term-green-bright">
            ✕
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
            className="rounded px-2 py-1 text-sm text-term-muted hover:bg-term-input"
          >
            ←
          </button>
          <p className="text-sm font-medium text-term-green-bright">
            {monthCursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <button
            onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
            className="rounded px-2 py-1 text-sm text-term-muted hover:bg-term-input"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-term-muted">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const key = day ? dateKey(day) : `blank-${i}`;
            const dayEvents = day ? (eventsByDay.get(key) ?? []) : [];
            const isSelected = day && selectedDay && dateKey(day) === dateKey(selectedDay);
            const isToday = day && dateKey(day) === dateKey(new Date());
            return (
              <button
                key={key}
                disabled={!day}
                onClick={() => day && setSelectedDay(day)}
                className={`flex h-12 flex-col items-center justify-center rounded text-xs ${
                  !day
                    ? 'invisible'
                    : isSelected
                      ? 'bg-term-green-dim text-term-bg'
                      : isToday
                        ? 'border border-term-green text-term-green-bright'
                        : 'text-term-green-bright hover:bg-term-input'
                }`}
              >
                <span>{day?.getDate()}</span>
                {dayEvents.length > 0 && <span className="mt-0.5 h-1 w-1 rounded-full bg-term-amber" />}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className="flex-1 overflow-y-auto border-t border-term-line pt-3">
            <p className="mb-2 text-xs font-medium text-term-muted">
              {selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            <div className="mb-3 space-y-1">
              {selectedDayEvents.length === 0 && (
                <p className="text-xs text-term-muted">No events yet.</p>
              )}
              {selectedDayEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded border border-term-line px-2 py-1.5 text-xs"
                >
                  <span className="text-term-green-bright">
                    {new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} —{' '}
                    {event.title}{' '}
                    <span className="text-term-muted">
                      ({event.visibility === 'GENERAL' ? 'team' : 'personal'})
                    </span>
                  </span>
                  {event.createdById === currentUserId && (
                    <button onClick={() => handleDelete(event.id)} className="text-term-red hover:opacity-80">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleCreate} className="space-y-2 border-t border-term-line pt-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full rounded border border-term-line bg-term-input px-2 py-1.5 text-sm text-term-green-bright outline-none focus:border-term-green"
              />
              <div className="flex gap-2">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded border border-term-line bg-term-input px-2 py-1 text-xs text-term-green-bright outline-none focus:border-term-green"
                />
                <label className="flex items-center gap-1 text-xs text-term-muted">
                  <input
                    type="radio"
                    checked={visibility === 'PERSONAL'}
                    onChange={() => setVisibility('PERSONAL')}
                  />
                  Personal
                </label>
                <label className="flex items-center gap-1 text-xs text-term-muted">
                  <input
                    type="radio"
                    checked={visibility === 'GENERAL'}
                    onChange={() => setVisibility('GENERAL')}
                  />
                  Team
                </label>
                {visibility === 'GENERAL' && (
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="rounded border border-term-line bg-term-input px-2 py-1 text-xs text-term-green-bright outline-none focus:border-term-green"
                  >
                    <option value="">Channel…</option>
                    {publicChannels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="submit"
                className="w-full rounded bg-term-green-dim py-1.5 text-xs font-medium text-term-bg hover:bg-term-green"
              >
                Add event
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
