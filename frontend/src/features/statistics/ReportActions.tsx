import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Loader2, Printer, Share2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportTeamReportCsv, exportTeamReportPdf, printTeamReportPdf } from "./report-export";
import { shareTeamReport } from "./report-share";

import { TeamPerformanceReport } from "./TeamPerformanceReport";
import type { TeamReportData } from "./team-report-model";
import "./report.css";

type Notice = { tone: "success" | "error"; message: string } | null;
type Operation = {
  mode: "print" | "share" | "pdf" | "csv";
  data: TeamReportData;
  controller: AbortController;
  pending: boolean;
};

export function ReportActions({ data }: { data: TeamReportData }) {
  const [exportOpen, setExportOpen] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const current = useRef<Operation | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    current.current?.controller.abort();
    current.current = null;
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExportOpen(false); menuRef.current?.querySelector("button")?.focus(); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const begin = (mode: Operation["mode"]) => {
    // Synchronous guard also covers multiple clicks before React commits.
    if (current.current) return null;
    const next: Operation = {
      mode,
      data: { overview: data.overview, context: { ...data.context, generatedAt: new Date() } },
      controller: new AbortController(),
      pending: mode === "pdf" || mode === "csv",
    };
    current.current = next;
    returnFocus.current = document.activeElement as HTMLElement;
    setNotice(null);
    setExportOpen(false);
    setOperation(next);
    return next;
  };

  const finish = (active: Operation, result?: Notice) => {
    if (current.current !== active) return;
    current.current = null;
    setOperation(null);
    if (result) setNotice(result);
  };

  const closePreview = () => {
    const active = current.current;
    // Native sharing must settle before another operation can start.
    if (!active || (active.mode === "share" && active.pending)) return;
    active.controller.abort();
    finish(active);
  };

  const exportReport = async (format: "pdf" | "csv") => {
    const active = begin(format);
    if (!active) return;
    try {
      if (format === "pdf") await exportTeamReportPdf(active.data, active.controller.signal);
      else exportTeamReportCsv(active.data);
      finish(active, { tone: "success", message: format.toUpperCase() + " report exported." });
    } catch (error) {
      if (active.controller.signal.aborted) return;
      console.error("Report export failed", error);
      finish(active, { tone: "error", message: "The " + format.toUpperCase() + " could not be generated. Please try again." });
    }
  };

  const proceed = async () => {
    const active = current.current;
    if (!active || active.pending || (active.mode !== "print" && active.mode !== "share")) return;
    // Open immediately on the click event, before asynchronous PDF generation:
    // browsers otherwise block a delayed window.open as a popup.
    const printTab = active.mode === "print" ? window.open("", "_blank") : null;
    active.pending = true;
    setOperation({ ...active });
    try {
      if (active.mode === "print") {
        if (!printTab) throw new Error("Allow popups to print the report.");
        await printTeamReportPdf(active.data, printTab, active.controller.signal);
        finish(active);
      } else {
        const result = await shareTeamReport(active.data);
        finish(active, result === "cancelled" ? undefined : {
          tone: "success",
          message: result === "shared" ? "Report shared." : "Report summary copied to the clipboard.",
        });
      }
    } catch (error) {
      if (active.controller.signal.aborted) return;
      console.error("Report action failed", error);
      finish(active, { tone: "error", message: active.mode === "print"
        ? "The report could not be printed. Please allow popups and try again."
        : "The report could not be shared or copied. Please try again." });
    }
  };

  const preview = operation?.mode === "print" || operation?.mode === "share" ? operation : null;
  const busy = operation !== null;
  return (
    <>
      <div className="report-actions no-print flex flex-wrap items-center gap-2" aria-busy={busy}>
        <Button variant="outline" disabled={busy} onClick={() => begin("share")}><Share2 /> Share</Button>
        <Button variant="outline" disabled={busy} onClick={() => begin("print")}><Printer /> Print</Button>
        <div className="relative" ref={menuRef}>
          <Button onClick={() => setExportOpen((open) => !open)} aria-expanded={exportOpen} disabled={busy}>
            {operation?.mode === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
            {operation?.mode === "pdf" ? "Generating…" : "Export"} <ChevronDown />
          </Button>
          {exportOpen && (
            <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
              <Button variant="ghost" className="w-full justify-start" onClick={() => void exportReport("pdf")}><FileText /> Export PDF</Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => void exportReport("csv")}><Table2 /> Export CSV</Button>
            </div>
          )}
        </div>
      </div>
      {preview && (
        <Dialog open onOpenChange={(open) => { if (!open) closePreview(); }}>
          <DialogContent
            className="flex max-h-[90dvh] min-w-0 flex-col gap-4 overflow-hidden sm:max-w-5xl"
            initialFocus={cancelRef}
            finalFocus={returnFocus}
            showCloseButton={!(preview.mode === "share" && preview.pending)}
          >
            <DialogHeader className="shrink-0 pr-8">
              <DialogTitle>{preview.mode === "print" ? "Print" : "Share"} team performance report</DialogTitle>
              <DialogDescription>Review {preview.data.context.teamName} · {preview.data.context.seasonName} · {preview.data.context.competitionName}.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
              <div><TeamPerformanceReport data={preview.data} /></div>
            </div>
            <DialogFooter className="shrink-0">
              {preview.pending && <p role="status" className="mr-auto self-center text-xs text-muted-foreground">
                {preview.mode === "print" ? "Preparing or printing… Close preview when finished if your browser does not close it automatically." : "Sharing…"}
              </p>}
              <Button ref={cancelRef} variant="outline" onClick={closePreview} disabled={preview.mode === "share" && preview.pending}>
                {preview.pending ? "Close preview" : "Cancel"}
              </Button>
              <Button disabled={preview.pending} onClick={() => void proceed()}>
                {preview.pending ? <Loader2 className="animate-spin" /> : preview.mode === "print" ? <Printer /> : <Share2 />}
                {preview.mode === "print" ? "Print report" : "Share report"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {notice && (
        <div role={notice.tone === "error" ? "alert" : "status"} className={"no-print fixed bottom-5 right-4 left-4 z-50 rounded-xl border bg-card px-4 py-3 text-sm shadow-xl sm:left-auto sm:max-w-sm " + (notice.tone === "error" ? "border-destructive/50 text-destructive" : "border-primary/40 text-foreground")}>
          {notice.message}
        </div>
      )}
    </>
  );
}
