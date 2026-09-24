import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Printer, Share2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportTeamReportCsv, exportTeamReportPdf } from "./report-export";
import { buildTeamReportCsv, safeReportFilename, type TeamReportData } from "./team-report-model";

type Notice = { tone: "success" | "error"; message: string } | null;

export function ReportActions({ data }: { data: TeamReportData }) {
  const [exportOpen, setExportOpen] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportOpen]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const exportPdf = async () => {
    setPdfPending(true);
    setExportOpen(false);
    try {
      await exportTeamReportPdf(data);
      setNotice({ tone: "success", message: "PDF report exported." });
    } catch (error) {
      console.error("PDF export failed", error);
      setNotice({ tone: "error", message: "The PDF could not be generated. Please try again." });
    } finally {
      setPdfPending(false);
    }
  };

  const exportCsv = () => {
    setExportOpen(false);
    try {
      exportTeamReportCsv(data);
      setNotice({ tone: "success", message: "CSV report exported." });
    } catch (error) {
      console.error("CSV export failed", error);
      setNotice({ tone: "error", message: "The CSV could not be generated. Please try again." });
    }
  };

  const share = async () => {
    const { context, overview } = data;
    const summary = [
      `Gaffer Team Performance Report — ${context.teamName}`,
      `${context.seasonName} · ${context.competitionName}`,
      `${overview.matchesPlayed} played · ${overview.wins}W ${overview.draws}D ${overview.losses}L · ${overview.goalsFor}-${overview.goalsAgainst} goals`,
    ].join("\n");
    try {
      const csv = buildTeamReportCsv(data);
      const suffix = safeReportFilename(context.teamName, context.generatedAt);
      const file = new File([csv], `Gaffer_Team_Performance_${suffix}.csv`, {
        type: "text/csv;charset=utf-8",
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Gaffer report — ${context.teamName}`,
          text: summary,
          files: [file],
        });
        setNotice({ tone: "success", message: "Report shared." });
        return;
      }
      await navigator.clipboard.writeText(summary);
      setNotice({ tone: "success", message: "Report summary copied to the clipboard." });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Report sharing failed", error);
      setNotice({ tone: "error", message: "The report could not be shared or copied." });
    }
  };

  return (
    <>
      <div className="report-actions no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void share()}>
          <Share2 /> Share
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        <div className="relative" ref={menuRef}>
          <Button
            onClick={() => setExportOpen((open) => !open)}
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            disabled={pdfPending}
          >
            <Download /> {pdfPending ? "Generating…" : "Export"} <ChevronDown />
          </Button>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => void exportPdf()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <FileText className="size-4 text-primary" /> Export PDF
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={exportCsv}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <Table2 className="size-4 text-primary" /> Export CSV
              </button>
            </div>
          )}
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className={`no-print fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border bg-card px-4 py-3 text-sm shadow-xl ${notice.tone === "error" ? "border-destructive/50 text-destructive" : "border-primary/40 text-foreground"}`}
        >
          {notice.message}
        </div>
      )}
    </>
  );
}
