"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useSafetyReviewerAccess } from "@/src/hooks/useSafetyReviewerAccess";
import type {
  ExternalPartyType,
  SafetyAction,
  SafetyCase,
  SafetyContactChannel,
  SafetyContactOutcome,
} from "@/src/lib/safety/cases";
import { loadSafetyCase, mutateSafetyCase, observeSafetyCase } from "@/src/services/safetyCaseService";

const partyTypes: ExternalPartyType[] = ["TRUSTED_CONTACT", "CLINICIAN", "AMBULANCE", "POLICE", "OTHER"];
const channels: SafetyContactChannel[] = ["PHONE", "SMS", "IN_PERSON", "OTHER"];
const failedOutcomes: Exclude<SafetyContactOutcome, "SUCCEEDED">[] = ["FAILED", "NO_ANSWER", "UNREACHABLE"];

function formatDate(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
}

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

function Field({ labelText, children }: { labelText: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[#325347]"><span>{labelText}</span>{children}</label>;
}

const inputClasses = "min-h-11 rounded-2xl border border-[#c1c8c3] bg-[#fff8f5] px-4 py-3 text-sm text-[#2c1601] shadow-[inset_0_2px_6px_rgba(44,22,1,.05)] focus:border-[#325347] focus:outline-none";

function TimelineItem({ action }: { action: SafetyAction }) {
  return (
    <li className="relative grid grid-cols-[1rem_1fr] gap-4 pb-6 last:pb-0">
      <span aria-hidden="true" className="mt-1.5 size-3 rounded-full border-2 border-[#325347] bg-[#c6ebda] after:absolute after:bottom-0 after:left-[5px] after:top-5 after:w-px after:bg-[#c1c8c3] last:after:hidden" />
      <div>
        <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-[#325347]">{label(action.type)}</p><span className="text-xs text-[#596c60]">{formatDate(action.createdAt)}</span></div>
        <p className="mt-1 text-xs text-[#596c60]">By {action.actorRole === "SYSTEM" ? "system" : action.actorUid} ({label(action.actorRole)})</p>
        {action.externalPartyType || action.channel || action.outcome ? <p className="mt-2 text-sm text-[#414845]">{[action.externalPartyType && label(action.externalPartyType), action.channel && label(action.channel), action.outcome && label(action.outcome)].filter(Boolean).join(" · ")}</p> : null}
        {action.note ? <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[#fff1e8] p-3 text-sm leading-6 text-[#414845]">{action.note}</p> : null}
      </div>
    </li>
  );
}

export default function SafetyCaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params?.caseId ?? "";
  const { user, loading: accessLoading, allowed } = useSafetyReviewerAccess();
  const [safetyCase, setSafetyCase] = useState<SafetyCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [party, setParty] = useState<ExternalPartyType>("TRUSTED_CONTACT");
  const [channel, setChannel] = useState<SafetyContactChannel>("PHONE");
  const [failedOutcome, setFailedOutcome] = useState<Exclude<SafetyContactOutcome, "SUCCEEDED">>("NO_ANSWER");
  const retryIds = useRef(new Map<string, string>());

  useEffect(() => {
    if (accessLoading) return;
    if (!user || !allowed) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    user.getIdToken().then(async (token) => {
      const initial = await loadSafetyCase(token, caseId);
      if (!active) return;
      setSafetyCase(initial);
      setLoading(false);
      unsubscribe = observeSafetyCase(caseId, (item) => {
        setSafetyCase(item);
        setError(item ? null : "This safety case no longer exists.");
      }, () => setError("Live updates are unavailable. Refresh before taking another action."));
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Could not load the safety case.");
      setLoading(false);
    });
    return () => { active = false; unsubscribe?.(); };
  }, [accessLoading, allowed, caseId, user]);

  async function perform(actionKey: string, body: Record<string, unknown>) {
    if (!user) return false;
    const fingerprint = `${actionKey}:${JSON.stringify(body)}`;
    const requestId = retryIds.current.get(fingerprint) ?? crypto.randomUUID();
    retryIds.current.set(fingerprint, requestId);
    setBusy(actionKey);
    setError(null);
    try {
      const confirmed = await mutateSafetyCase(await user.getIdToken(), caseId, { ...body, requestId });
      retryIds.current.delete(fingerprint);
      setSafetyCase(confirmed);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Safety case action failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function submitWithNote(event: FormEvent<HTMLFormElement>, actionKey: string, body: Record<string, unknown>) {
    event.preventDefault();
    const form = event.currentTarget;
    const note = String(new FormData(form).get("note") ?? "").trim();
    void perform(actionKey, { ...body, ...(note ? { note } : {}) }).then((succeeded) => {
      if (succeeded) form.reset();
    });
  }

  if (accessLoading || (user && allowed && loading)) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Loading safety case" /></div>;
  if (!user) return <div className="workspace"><p role="alert" className="clay-card p-7">Sign in to access this safety case.</p></div>;
  if (!allowed) return <div className="workspace"><p role="alert" className="rounded-[2rem] bg-[#ffdad6] p-7 text-[#93000a]">This account is not authorized as a safety reviewer. Therapist status alone does not grant access.</p></div>;
  if (!safetyCase) return <div className="workspace space-y-4">{error ? <p role="alert" className="rounded-2xl bg-[#ffdad6] p-5 text-[#93000a]">{error}</p> : null}<Link className="clay-link" href="/safety">Back to safety queue</Link></div>;

  const isResolved = safetyCase.status === "RESOLVED";
  const canHandoff = safetyCase.status === "ACKNOWLEDGED" || safetyCase.status === "HUMAN_CONNECTED";
  const canResolve = safetyCase.status === "HUMAN_CONNECTED" || safetyCase.status === "EXTERNAL_HANDOFF";

  return (
    <div className="workspace space-y-6 text-[#2c1601]">
      <Link href="/safety" className="inline-flex items-center gap-2 text-sm font-medium text-[#325347] underline decoration-[#abcebf] underline-offset-4"><span aria-hidden="true">←</span> Safety queue</Link>
      <header className="clay-page-header clay-page-header--sage">
        <div className="relative z-10">
          <p className="clay-eyebrow">Safety case</p>
          <h1 className="mt-2 text-2xl font-medium md:text-4xl">{safetyCase.id}</h1>
          <div className="mt-4 flex flex-wrap gap-2"><Badge variant="moss">{label(safetyCase.currentState)}</Badge><Badge variant="clay">{label(safetyCase.status)}</Badge><Badge variant={safetyCase.reviewUrgency === "IMMEDIATE" ? "rose" : "peach"}>{label(safetyCase.reviewUrgency)} urgency</Badge></div>
        </div>
      </header>
      {error ? <p role="alert" className="rounded-2xl bg-[#ffdad6] p-4 text-sm text-[#93000a]">{error}</p> : null}

      <section aria-labelledby="case-header" className="clay-card p-6 md:p-8">
        <h2 id="case-header" className="text-xl font-medium text-[#325347]">Case header</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[#596c60]">Created</dt><dd className="mt-1 font-medium">{formatDate(safetyCase.createdAt)}</dd></div>
          <div><dt className="text-[#596c60]">Acknowledged</dt><dd className="mt-1 font-medium">{formatDate(safetyCase.acknowledgedAt)}</dd></div>
          <div><dt className="text-[#596c60]">Assigned reviewer</dt><dd className="mt-1 font-medium">{safetyCase.assignedReviewerUid ?? "Unassigned"}</dd></div>
          <div><dt className="text-[#596c60]">Source</dt><dd className="mt-1 font-medium">{label(safetyCase.source)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="context" className="clay-card p-6 md:p-8">
        <h2 id="context" className="text-xl font-medium text-[#325347]">Relevant safety context</h2>
        <p className="mt-2 text-sm text-[#596c60]">Only the triggering user text and structured safety assessment are included. No journal or unrelated transcript is loaded.</p>
        <blockquote className="mt-5 whitespace-pre-wrap rounded-[1.75rem] bg-[#fff1e8] p-5 text-sm leading-7 text-[#2c1601]">{safetyCase.relevantUserText}</blockquote>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-[#596c60]">Trigger</dt><dd className="mt-1 font-medium">{label(safetyCase.trigger)}</dd></div>
          <div><dt className="text-[#596c60]">Safety target</dt><dd className="mt-1 font-medium">{label(safetyCase.safetyTarget)}</dd></div>
          <div><dt className="text-[#596c60]">Assessment</dt><dd className="mt-1 font-medium">{label(safetyCase.assessmentStatus)}</dd></div>
          <div><dt className="text-[#596c60]">Next assessment step</dt><dd className="mt-1 font-medium">{label(safetyCase.assessmentStep)}</dd></div>
          <div><dt className="text-[#596c60]">External action</dt><dd className="mt-1 font-medium">{safetyCase.externalActionStatus ? label(safetyCase.externalActionStatus) : "Not recorded"}</dd></div>
          <div><dt className="text-[#596c60]">Policy version</dt><dd className="mt-1 break-all font-medium">{safetyCase.policyVersion}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="actions" className="clay-card p-6 md:p-8">
        <h2 id="actions" className="text-xl font-medium text-[#325347]">Action panel</h2>
        <p className="mt-2 text-sm leading-6 text-[#596c60]">Actions appear in the case only after backend confirmation. Notes should be concise and operational.</p>
        {isResolved ? <p className="mt-5 rounded-2xl bg-[#c6ebda]/50 p-4 text-sm text-[#2d4d41]">This case is resolved. Further mutations are blocked.</p> : (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-[1.75rem] bg-[#fff1e8] p-5">
              <h3 className="font-medium text-[#325347]">Ownership</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={safetyCase.status !== "OPEN" || busy !== null} isLoading={busy === "acknowledge"} onClick={() => perform("acknowledge", { action: "ACKNOWLEDGE" })}>Acknowledge</Button>
                <Button variant="secondary" disabled={Boolean(safetyCase.assignedReviewerUid) || busy !== null} isLoading={busy === "assign"} onClick={() => perform("assign", { action: "ASSIGN_SELF" })}>Assign to me</Button>
              </div>
            </div>

            <form onSubmit={(event) => submitWithNote(event, "attempt", { action: "CONTACT_ATTEMPT", externalPartyType: party, channel })} className="rounded-[1.75rem] bg-[#fff1e8] p-5">
              <h3 className="font-medium text-[#325347]">Record contact attempt</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field labelText="Target type"><select className={inputClasses} value={party} onChange={(event) => setParty(event.target.value as ExternalPartyType)}>{partyTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field labelText="Channel"><select className={inputClasses} value={channel} onChange={(event) => setChannel(event.target.value as SafetyContactChannel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field labelText="Optional note"><textarea name="note" maxLength={1000} rows={3} className={`${inputClasses} sm:col-span-2`} /></Field>
              </div>
              <Button className="mt-4" disabled={busy !== null} isLoading={busy === "attempt"} type="submit">Record attempt</Button>
            </form>

            <form onSubmit={(event) => submitWithNote(event, "failed-outcome", { action: "CONTACT_OUTCOME", externalPartyType: party, channel, outcome: failedOutcome })} className="rounded-[1.75rem] bg-[#fff1e8] p-5">
              <h3 className="font-medium text-[#325347]">Record failed contact</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field labelText="Target type"><select className={inputClasses} value={party} onChange={(event) => setParty(event.target.value as ExternalPartyType)}>{partyTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field labelText="Channel"><select className={inputClasses} value={channel} onChange={(event) => setChannel(event.target.value as SafetyContactChannel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></Field>
              </div>
              <Field labelText="Outcome"><select className={inputClasses} value={failedOutcome} onChange={(event) => setFailedOutcome(event.target.value as typeof failedOutcome)}>{failedOutcomes.map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field labelText="Optional note"><textarea name="note" maxLength={1000} rows={3} className={inputClasses} /></Field>
              <Button className="mt-4" variant="secondary" disabled={busy !== null} isLoading={busy === "failed-outcome"} type="submit">Record failed outcome</Button>
            </form>

            <form onSubmit={(event) => submitWithNote(event, "successful-contact", { action: "CONTACT_OUTCOME", externalPartyType: party, channel, outcome: "SUCCEEDED" })} className="rounded-[1.75rem] bg-[#c6ebda]/40 p-5">
              <h3 className="font-medium text-[#325347]">Confirm successful human contact</h3>
              <p className="mt-2 text-xs leading-5 text-[#596c60]">Use only after a real person was reached. An attempted call or queued message is not success.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field labelText="Who was reached"><select className={inputClasses} value={party} onChange={(event) => setParty(event.target.value as ExternalPartyType)}>{partyTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field labelText="Channel"><select className={inputClasses} value={channel} onChange={(event) => setChannel(event.target.value as SafetyContactChannel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></Field>
              </div>
              <Field labelText="Required minimal confirmation note"><textarea required name="note" maxLength={1000} rows={3} className={`${inputClasses} mt-4`} /></Field>
              <Button className="mt-4" disabled={safetyCase.status !== "ACKNOWLEDGED" || busy !== null} isLoading={busy === "successful-contact"} type="submit">Confirm human connected</Button>
            </form>

            <form onSubmit={(event) => submitWithNote(event, "handoff", { action: "EXTERNAL_HANDOFF", externalPartyType: party, channel })} className="rounded-[1.75rem] bg-[#fed1b4]/45 p-5">
              <h3 className="font-medium text-[#325347]">Record verified external handoff</h3>
              <p className="mt-2 text-xs leading-5 text-[#596c60]">Use only after the handoff was confirmed—not when it was merely requested or attempted.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field labelText="External party"><select className={inputClasses} value={party} onChange={(event) => setParty(event.target.value as ExternalPartyType)}>{partyTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field labelText="Channel"><select className={inputClasses} value={channel} onChange={(event) => setChannel(event.target.value as SafetyContactChannel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></Field>
              </div>
              <Field labelText="Optional note"><textarea name="note" maxLength={1000} rows={3} className={`${inputClasses} mt-4`} /></Field>
              <Button className="mt-4" disabled={!canHandoff || busy !== null} isLoading={busy === "handoff"} type="submit">Confirm external handoff</Button>
            </form>

            <form onSubmit={(event) => {
              event.preventDefault();
              const resolutionNote = String(new FormData(event.currentTarget).get("resolutionNote") ?? "").trim();
              if (resolutionNote) void perform("resolve", { action: "RESOLVE", resolutionNote });
            }} className="rounded-[1.75rem] bg-[#ffe3cd] p-5">
              <h3 className="font-medium text-[#325347]">Resolve case</h3>
              <Field labelText="Required resolution note"><textarea required name="resolutionNote" maxLength={1000} rows={3} className={`${inputClasses} mt-4`} /></Field>
              <Button className="mt-4" variant="danger" disabled={!canResolve || busy !== null} isLoading={busy === "resolve"} type="submit">Resolve after human review</Button>
            </form>

            <form onSubmit={(event) => submitWithNote(event, "note", { action: "ADD_NOTE" })} className="rounded-[1.75rem] bg-[#fff1e8] p-5">
              <h3 className="font-medium text-[#325347]">Add operational note</h3>
              <p className="mt-2 text-xs leading-5 text-[#596c60]">Do not duplicate therapy notes, full conversation content, or journal information.</p>
              <Field labelText="Required note"><textarea required name="note" maxLength={1000} rows={3} className={`${inputClasses} mt-4`} /></Field>
              <Button className="mt-4" variant="secondary" disabled={busy !== null} isLoading={busy === "note"} type="submit">Add note</Button>
            </form>
          </div>
        )}
      </section>

      <section aria-labelledby="timeline" className="clay-card p-6 md:p-8">
        <h2 id="timeline" className="text-xl font-medium text-[#325347]">Audit timeline</h2>
        <p className="mt-2 text-sm text-[#596c60]">Append-only, backend-confirmed operational events.</p>
        <ol className="mt-6">{safetyCase.actions.map((action) => <TimelineItem key={action.id} action={action} />)}</ol>
      </section>
    </div>
  );
}
