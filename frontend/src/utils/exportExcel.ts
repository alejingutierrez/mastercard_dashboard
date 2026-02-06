export interface ExcelSheet {
  name: string;
  data: Record<string, unknown>[];
}

const sanitizeSheetName = (name: string, fallback = "Sheet"): string => {
  const raw = typeof name === "string" ? name.trim() : "";
  const base = raw.length > 0 ? raw : fallback;
  // Excel sheet name rules: max 31 chars, cannot include: \ / ? * [ ]
  const cleaned = base.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
};

const ensureXlsxExtension = (fileName: string): string => {
  const trimmed = typeof fileName === "string" ? fileName.trim() : "";
  if (!trimmed) {
    return "export.xlsx";
  }
  return trimmed.toLowerCase().endsWith(".xlsx") ? trimmed : `${trimmed}.xlsx`;
};

export const exportExcel = async ({
  fileName,
  sheets,
}: {
  fileName: string;
  sheets: ExcelSheet[];
}): Promise<void> => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Excel export is only supported in the browser.");
  }

  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("No sheets provided for Excel export.");
  }

  // Lazy-load heavy dependency to avoid penalizing initial load.
  const XLSX = await import("xlsx");

  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet, index) => {
    const safeName = sanitizeSheetName(sheet.name, `Sheet${index + 1}`);
    const data = Array.isArray(sheet.data) ? sheet.data : [];
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
  });

  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as unknown as ArrayBuffer;

  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = ensureXlsxExtension(fileName);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Let the browser start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
