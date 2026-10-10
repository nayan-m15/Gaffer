/** Share the same chart-bearing PDF used by Print and Export PDF. */
export async function shareTeamReport(file: File): Promise<"shared" | "downloaded" | "cancelled"> {
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: file.name.replace(/\.pdf$/i, ""), files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
      // A browser may expose Web Share but still deny file sharing; fall back to download.
      console.warn("Native PDF sharing unavailable; downloading instead", error);
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    return "downloaded";
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
