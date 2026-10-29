"use client";
import { useEffect, useState } from "react";
import { adminFetch, useAdminData } from "./client";
import {
  sections,
  days,
  clinicFields,
  bookingFields,
  type Section,
  type Field,
  type EditorRow,
} from "@/lib/clinic-editor";
import { DoctorEditor } from "./DoctorEditor";
type Configuration = Record<Section | "settings", EditorRow[]>;
export type ClinicData = {
  migrated: boolean;
  sheetId: string;
  version: string;
  configuration: Configuration;
};
export function ClinicConfiguration() {
  const source = useAdminData<ClinicData>("/api/admin/clinic-config");
  if (source.error)
    return (
      <p role="alert" className="error">
        {source.error}
      </p>
    );
  if (!source.data) return <p role="status">Loading clinic configuration…</p>;
  if (!source.data.migrated)
    return (
      <p className="notice">
        Migrate the website workbook before using clinic management.
      </p>
    );
  return (
    <ConfigurationForms
      key={source.data.version}
      initial={source.data}
      reload={source.reload}
    />
  );
}
function ConfigurationForms({
  initial,
  reload,
}: {
  initial: ClinicData;
  reload: () => void;
}) {
  const [config, setConfig] = useState(initial.configuration),
    [tab, setTab] = useState<Section | "clinic" | "booking" | "doctors">(
      "clinic",
    );
  const [editing, setEditing] = useState<number | null>(null),
    [draft, setDraft] = useState<EditorRow>([]),
    [search, setSearch] = useState(""),
    [active, setActive] = useState("all");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [doctorDirty, setDoctorDirty] = useState(false);
  const doctors = useAdminData<{ doctors: { row: EditorRow }[] }>(
    "/api/admin/doctors",
  );
  const dirty =
    JSON.stringify(config) !== JSON.stringify(initial.configuration) ||
    editing !== null;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const switchTab = (next: typeof tab) => {
    if (
      (editing !== null || doctorDirty) &&
      !window.confirm("Discard this unfinished record?")
    )
      return;
    setEditing(null);
    setDoctorDirty(false);
    setTab(next);
    setMessage("");
    setSearch("");
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const impact=await adminFetch<{warnings:{reference:string;date:string;reason:string}[];acknowledgement:string}>('/api/admin/clinic-config',{method:'POST',body:JSON.stringify({sheetId:initial.sheetId,configuration:config})});
      if(impact.warnings.length&&!window.confirm(`These existing appointments conflict with the proposed settings. They will remain unchanged:\n${impact.warnings.map(w=>`${w.reference} · ${w.date} · ${w.reason}`).join('\n')}\nSave settings anyway?`))return;
      await adminFetch("/api/admin/clinic-config", {
        method: "PATCH",
        body: JSON.stringify({
          sheetId: initial.sheetId,
          version: initial.version,
          configuration: config,
            acknowledgement:impact.acknowledgement,
        }),
      });
      setMessage(
        "Saved. New bookings and chatbot answers use this configuration.",
      );
      reload();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Save failed. Your changes are still here.",
      );
    } finally {
      setBusy(false);
    }
  };
  const setSetting = (key: string, value: string) =>
    setConfig((c) => ({
      ...c,
      settings: c.settings.some((r) => r[0] === key)
        ? c.settings.map((r) => (r[0] === key ? [key, value] : r))
        : [...c.settings, [key, value]],
    }));
  const selected = tab in sections ? (tab as Section) : null;
  const meta = selected ? sections[selected] : null;
  return (
    <div className="clinic-manager">
      <p className="eyebrow">Clinic workspace</p>
      <h1>Manage your clinic</h1>
      <p className="muted">
        Edit treatments, schedules and the information patients receive. Doctor
        records sync with your website’s Google Sheet.
      </p>
      <div
        className="clinic-tabs"
        role="navigation"
        aria-label="Clinic sections"
      >
        {(
          [
            ["clinic", "Clinic details"],
            ["services", "Services"],
            ["doctors", "Doctors"],
            ["hours", "Working hours"],
            ["specializations", "Specializations"],
            ["holidays", "Holidays"],
            ["faq", "FAQ answers"],
            ["booking", "Booking rules"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "" : "secondary"}
            aria-pressed={tab === id}
            onClick={() => switchTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className="notice">
          {message.replaceAll("_", " ")}
          {message.includes("changed") && (
            <button
              className="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    "Reload saved configuration and discard this draft?",
                  )
                )
                  reload();
              }}
            >
              Reload latest data
            </button>
          )}
        </p>
      )}
      {tab === "doctors" ? (
        <DoctorEditor
          configuration={initial.configuration}
          sheetId={initial.sheetId}
          onDirty={setDoctorDirty}
        />
      ) : (
        <>
          {(tab === "clinic" || tab === "booking") && (
            <section className="card">
              <h2>{tab === "clinic" ? "Clinic details" : "Booking rules"}</h2>
              <p className="muted">
                {tab === "clinic"
                  ? "Used by the booking assistant. Leave an optional field empty to keep its configured fallback."
                  : "Adjust availability settings for future bookings. Existing appointments remain unchanged."}
              </p>
              <div className="form-grid">
                {(tab === "clinic" ? clinicFields : bookingFields).map(
                  ([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type={tab === "booking" ? "number" : "text"}
                        min={
                          ["slot_granularity", "hold_minutes"].includes(key)
                            ? 1
                            : 0
                        }
                        value={String(
                          config.settings.find((r) => r[0] === key)?.[1] ?? "",
                        )}
                        onChange={(e) => setSetting(key, e.target.value)}
                      />
                    </label>
                  ),
                )}
              </div>
              {tab === "booking" && (
                <p className="notice">
                  Website cancellations: 0-hour cutoff. Email-link
                  cancellations: 4-hour cutoff. New bookings have no additional lead time or buffer. Back-to-back appointments are allowed.
                  Timezone is managed with integration setup.
                </p>
              )}
            </section>
          )}
          {selected && meta && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>{meta.title}</h2>
                  <p className="muted">{meta.description}</p>
                </div>
                <button
                  type="button"
                  disabled={editing !== null}
                  onClick={() => {
                    setEditing(-1);
                    setDraft(
                      meta.fields.map((f: Field, i) =>
                        f.kind === "boolean"
                          ? f.label === "Closed"
                            ? "FALSE"
                            : "TRUE"
                          : i === 0 &&
                              ["services", "specializations", "faq"].includes(
                                selected,
                              )
                            ? `${selected.slice(0, 3)}-${crypto.randomUUID().slice(0, 8)}`
                            : "",
                      ),
                    );
                  }}
                >
                  Add {selected === "hours" ? "working day" : "record"}
                </button>
              </div>
              {selected==='hours'&&<fieldset><legend>Weekly clinic off days</legend><div className="choice-grid">{days.map(day=>{const row=config.hours.find(r=>!r[6]&&String(r[0]).toLowerCase()===day.toLowerCase());return <label className="check-label" key={day}><input type="checkbox" checked={!row||String(row[5]).toUpperCase()==='TRUE'} onChange={e=>{const closed=e.target.checked;setConfig(c=>({...c,hours:[...c.hours.filter(r=>r[6]||String(r[0]).toLowerCase()!==day.toLowerCase()),[day,row?.[1]||'10:00',row?.[2]||'19:00',row?.[3]||'',row?.[4]||'',closed?'TRUE':'FALSE','']]}));}}/>{day}</label>})}</div><small>Checked days are closed for every doctor. Existing appointments are not changed.</small></fieldset>}
              {selected === "hours" && (
                <p className="notice">
                  Changing hours affects future availability. Review existing
                  appointments before saving; no appointment will be moved or
                  cancelled.
                </p>
              )}
              {selected === "hours" && (
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={editing !== null}
                    onClick={() => {
                      const monday = config.hours.find(
                        (r) => String(r[0]).toLowerCase() === "monday" && !r[6],
                      );
                      if (!monday) {
                        setMessage("Add clinic Monday hours first.");
                        return;
                      }
                      const weekdays = days.slice(1, 5);
                      setConfig((c) => ({
                        ...c,
                        hours: [
                          ...c.hours.filter(
                            (r) =>
                              r[6] ||
                              !weekdays.some(
                                (day) =>
                                  day.toLowerCase() ===
                                  String(r[0]).toLowerCase(),
                              ),
                          ),
                          ...weekdays.map((day) => [day, ...monday.slice(1)]),
                        ],
                      }));
                      setMessage(
                        "Monday hours copied to Tuesday–Friday in your draft. Review before saving.",
                      );
                    }}
                  >
                    Copy clinic Monday to weekdays
                  </button>
                </div>
              )}
              <div className="filters">
                <label>
                  Search
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${meta.title.toLowerCase()}`}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={active}
                    onChange={(e) => setActive(e.target.value)}
                  >
                    <option value="all">All records</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>Details</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config[selected].map((row, index) => {
                      if (String(row[0]).startsWith("#")) return null;
                      const statusIndex = (meta.fields as Field[]).findIndex(
                        (f) => f.label === "Active",
                      );
                      const enabled =
                        statusIndex < 0 ||
                        String(row[statusIndex]).toUpperCase() !== "FALSE";
                      if (
                        !row
                          .join(" ")
                          .toLowerCase()
                          .includes(search.toLowerCase()) ||
                        (active !== "all" && enabled !== (active === "active"))
                      )
                        return null;
                      return (
                        <tr key={index}>
                          <td>
                            <strong>
                              {String(
                                row[
                                  selected === "hours" ||
                                  selected === "holidays"
                                    ? 0
                                    : 1
                                ] || row[0],
                              )}
                            </strong>
                            {statusIndex >= 0 && (
                              <small>{enabled ? "Active" : "Inactive"}</small>
                            )}
                          </td>
                          <td>
                            {selected === "services"
                              ? `${row[2]} min · ${row[3]}`
                              : selected === "hours"
                                ? `${doctors.data?.doctors.find((d) => d.row[0] === row[6])?.row[1] || row[6] || "Clinic"} · ${String(row[5]).toUpperCase() === "TRUE" ? "Closed" : `${row[1]}–${row[2]}`}`
                                : String(
                                    row[selected === "faq" ? 2 : 1] || "",
                                  ).slice(0, 140)}
                          </td>
                          <td>
                            <button
                              className="secondary"
                              disabled={editing !== null}
                              onClick={() => {
                                setEditing(index);
                                setDraft([...row]);
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {editing !== null && (
                <form
                  className="record-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setConfig((c) => ({
                      ...c,
                      [selected]:
                        editing < 0
                          ? [...c[selected], draft]
                          : c[selected].map((r, i) =>
                              i === editing ? draft : r,
                            ),
                    }));
                    setEditing(null);
                    setMessage(
                      "Record updated in your draft. Save changes below to publish it.",
                    );
                  }}
                >
                  <h3>{editing < 0 ? "New record" : "Edit record"}</h3>
                  <div className="form-grid">
                    {(meta.fields as Field[]).map((field, i) => {
                      const value = String(draft[i] ?? "");
                      const update = (v: string) =>
                        setDraft((d) => {
                          const next = [...d];
                          next[i] = v;
                          return next;
                        });
                      const hidden =
                        i === 0 &&
                        ["services", "faq", "specializations"].includes(
                          selected,
                        );
                      if (hidden) return null;
                      return (
                        <label key={field.label}>
                          {field.label}
                          {field.kind === "boolean" ? (
                            <select
                              value={
                                value.toUpperCase() === "FALSE"
                                  ? "FALSE"
                                  : "TRUE"
                              }
                              onChange={(e) => update(e.target.value)}
                            >
                              <option value="TRUE">Yes</option>
                              <option value="FALSE">No</option>
                            </select>
                          ) : ["day", "doctor", "specialization"].includes(
                              field.kind || "",
                            ) ? (
                            <select
                              required={field.required}
                              value={value}
                              onChange={(e) => update(e.target.value)}
                            >
                              <option value="">
                                {field.kind === "doctor"
                                  ? "Use clinic schedule"
                                  : field.kind === "specialization"
                                    ? "Not specified"
                                    : "Choose day"}
                              </option>
                              {(field.kind === "day"
                                ? days.map((d) => [d, d.toUpperCase()])
                                : field.kind === "doctor"
                                  ? (doctors.data?.doctors || []).map((d) => [
                                      d.row[0],
                                      d.row[1],
                                    ])
                                  : config.specializations.map((r) => [
                                      r[0],
                                      r[1],
                                    ])
                              ).map(([id, name]) => (
                                <option key={String(id)} value={String(id)}>
                                  {String(name)}
                                </option>
                              ))}
                            </select>
                          ) : field.kind === "long" ? (
                            <textarea
                              rows={4}
                              required={field.required}
                              value={value}
                              onChange={(e) => update(e.target.value)}
                            />
                          ) : (
                            <input
                              type={field.kind || "text"}
                              min={selected==='services'&&i===2?Number(config.settings.find(r=>r[0]==='slot_granularity')?.[1]||30):field.min}
                                step={selected==='services'&&i===2?Number(config.settings.find(r=>r[0]==='slot_granularity')?.[1]||30):undefined}
                              max={field.max}
                              required={field.required}
                              value={value}
                              onChange={(e) => update(e.target.value)}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="actions">
                    <button>Apply to draft</button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditing(null)}
                    >
                      Cancel edit
                    </button>
                    {["hours", "holidays"].includes(selected) &&
                      editing >= 0 && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setConfig((c) => ({
                              ...c,
                              [selected]: c[selected].filter(
                                (_, i) => i !== editing,
                              ),
                            }));
                            setEditing(null);
                          }}
                        >
                          Remove this{" "}
                          {selected === "hours" ? "working day" : "holiday"}
                        </button>
                      )}
                  </div>
                </form>
              )}
            </section>
          )}
          <div className="save-bar">
            <span>
              {dirty ? "You have unsaved changes" : "All changes saved"}
            </span>
            <button
              disabled={busy || !dirty || editing !== null}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              className="secondary"
              disabled={busy || !dirty}
              onClick={() => {
                setConfig(initial.configuration);
                setEditing(null);
                setMessage("Draft discarded.");
              }}
            >
              Discard changes
            </button>
          </div>
        </>
      )}
    </div>
  );
}
