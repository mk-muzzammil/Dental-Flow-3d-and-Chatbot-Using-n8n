"use client";
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useEffect, useState } from "react";
import { adminFetch, useAdminData } from "./client";
import type { ClinicData } from "./ClinicConfiguration";
import type { EditorRow } from "@/lib/clinic-editor";
type Doctor = {
  row: EditorRow;
  connection: { calendarId: string; email: string };
  version: string;
};
export function DoctorEditor({
  configuration,
  sheetId,
  onDirty,
}: {
  onDirty: (dirty: boolean) => void;
  configuration: ClinicData["configuration"];
  sheetId: string;
}) {
  const source = useAdminData<{
    sheetId: string;
    pending: boolean;
    doctors: Doctor[];
  }>("/api/admin/doctors");
  const [draft, setDraft] = useState<Doctor | null>(null),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    onDirty(!!draft);
  }, [draft, onDirty]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (draft) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draft]);
  const edit = (d: Doctor) => {
    setDraft(structuredClone(d));
    setKey(crypto.randomUUID());
    setMessage("");
  };
  const setCell = (index: number, value: string) =>
    setDraft((d) =>
      d ? { ...d, row: d.row.map((v, i) => (i === index ? value : v)) } : d,
    );
  const choices = (index: number, items: EditorRow[]) => (
    <div className="choice-grid">
      {items.map((r) => (
        <label className="check-label" key={String(r[0])}>
          <input
            type="checkbox"
            checked={String(draft?.row[index] || "")
              .split(",")
              .includes(String(r[0]))}
            onChange={(e) => {
              const selected = String(draft?.row[index] || "")
                .split(",")
                .filter((v) => v && v !== "all" && v !== r[0]);
              if (e.target.checked) selected.push(String(r[0]));
              setCell(index, selected.join(","));
            }}
          />
          {String(r[1])}
        </label>
      ))}
    </div>
  );
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Doctors</h2>
          <p className="muted">
            Profiles are loaded from the Doctors Sheet. Calendar IDs and staff
            email addresses stay encrypted in MongoDB.
          </p>
        </div>
        <button
          disabled={!!draft || busy || source.loading || !source.data}
          onClick={() =>
            edit({
              row: ["", "", "all", "TRUE", "", ""],
              connection: { calendarId: "", email: "" },
              version: "",
            })
          }
        >
          Add doctor
        </button>
      </div>
      {source.error && (
        <p role="alert" className="error">
          {source.error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message.replaceAll("_", " ")}
        </p>
      )}
      {source.data?.pending && (
        <p className="notice">
          A previous doctor update needs to finish.{" "}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await adminFetch("/api/admin/doctors", {
                  method: "POST",
                  body: JSON.stringify({ action: "resume" }),
                });
                setDraft(null);
                source.reload();
                setMessage("Previous update recovered.");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Recovery failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <LoadingIndicator inline label="Recovering save…" /> : "Resume interrupted save"}
          </button>
        </p>
      )}
      {source.loading && source.data && <LoadingIndicator compact label="Refreshing doctors…" />}
      <label>
        Search doctors
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {!source.data ? (
        source.loading ? <LoadingIndicator label="Loading doctors from Google Sheets…" /> : null
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Doctors">
          <table>
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Specializations</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {source.data.doctors
                .filter((d) =>
                  d.row.join(" ").toLowerCase().includes(search.toLowerCase()),
                )
                .map((d) => (
                  <tr key={String(d.row[0])}>
                    <td>
                      <strong>{String(d.row[1])}</strong>
                    </td>
                    <td>{String(d.row[5] || "Not specified")}</td>
                    <td>
                      {String(d.row[3]).toUpperCase() === "FALSE"
                        ? "Inactive"
                        : "Active"}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        disabled={!!draft || busy || source.loading || !source.data}
                        onClick={() => edit(d)}
                      >
                        Edit doctor
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {draft && (
        <form
          className="record-editor"
          onChange={() => setKey(crypto.randomUUID())}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await adminFetch("/api/admin/doctors", {
                method: "PATCH",
                body: JSON.stringify({ ...draft, key, sheetId }),
              });
              setDraft(null);
              setMessage(
                "Doctor saved to Google Sheets. Private connection saved to MongoDB.",
              );
              source.reload();
            } catch (error) {
              source.reload();
              setMessage(
                `${error instanceof Error ? error.message : "Save failed"}. Keep this form open and retry the same save if interrupted.`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{draft.row[0] ? "Edit doctor" : "New doctor"}</h3>
          <fieldset disabled={busy || source.data?.pending}>
            <legend>Doctor details</legend>
            <div className="form-grid">
              <label>
                Doctor name
                <input
                  required
                  value={String(draft.row[1])}
                  onChange={(e) => setCell(1, e.target.value)}
                />
              </label>
              <label>
                Status
                <select
                  value={
                    String(draft.row[3]).toUpperCase() === "FALSE"
                      ? "FALSE"
                      : "TRUE"
                  }
                  onChange={(e) => setCell(3, e.target.value)}
                >
                  <option value="TRUE">Active — accepts bookings</option>
                  <option value="FALSE">Inactive — keep history</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Services this doctor offers</legend>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={draft.row[2] === "all" || !draft.row[2]}
                  onChange={(e) =>
                    setCell(
                      2,
                      e.target.checked
                        ? "all"
                        : String(configuration.services[0]?.[0] || ""),
                    )
                  }
                />
                All services
              </label>
              {choices(2, configuration.services)}
              <small>No specific selection means all services.</small>
            </fieldset>
            <fieldset>
              <legend>Verified specializations</legend>
              {choices(4, configuration.specializations)}
              {!configuration.specializations.length && (
                <p>
                  Create a specialization in the Specializations section first.
                </p>
              )}
            </fieldset>
            <div className="form-grid">
              <label>
                Google Calendar ID
                <input
                  required
                  value={draft.connection.calendarId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      connection: {
                        ...draft.connection,
                        calendarId: e.target.value,
                      },
                    })
                  }
                />
                <small>
                  Use the doctor’s separate calendar ID from Google Calendar
                  settings.
                </small>
              </label>
              <label>
                Staff email (optional, private)
                <input
                  type="email"
                  value={draft.connection.email}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      connection: {
                        ...draft.connection,
                        email: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <p className="notice">
              Changing a doctor’s calendar affects new bookings only. Existing
              appointments keep their original calendar. Manage this doctor’s
              schedule under Working hours.
            </p>
          </fieldset>
          <div className="actions">
            <button disabled={busy}>{busy ? <LoadingIndicator inline label="Working…" /> : "Save doctor"}</button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await adminFetch<{ detail: string }>(
                    "/api/admin/doctors",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        calendarId: draft.connection.calendarId,
                      }),
                    },
                  );
                  setMessage(result.detail);
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Check failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Check calendar access
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
