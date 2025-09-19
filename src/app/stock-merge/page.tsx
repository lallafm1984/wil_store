"use client";

import React, { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type RowObject = Record<string, unknown>;

type ParsedSheet = {
  filename: string;
  headers: string[]; // 원본 헤더 순서 유지
  rows: RowObject[]; // sheet_to_json 결과
};

type MappingInfo = {
  joinKey?: string;
  baseQtyKey?: string;
  baseLocKey?: string;
  baseVendorKey?: string;
  srcQtyKey?: string; // fallback (신논현/논현 구분 불가 시)
  srcLocKey?: string; // fallback
  srcQtyKeySinnonhyeon?: string;
  srcLocKeySinnonhyeon?: string;
  srcQtyKeyNonhyeon?: string;
  srcLocKeyNonhyeon?: string;
};

function normalizeString(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .toLowerCase();
}

function sheetToOrdered(headersSheet: XLSX.WorkSheet): string[] {
  const headerRows = XLSX.utils.sheet_to_json<string[]>(headersSheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  if (Array.isArray(headerRows) && headerRows.length > 0) {
    const firstRow = headerRows[0] as unknown[];
    return (firstRow || []).map((h) => String(h ?? ""));
  }
  return [];
}

async function parseFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return { filename: file.name, headers: [], rows: [] };

  const headers = sheetToOrdered(sheet);
  const rows = XLSX.utils.sheet_to_json<RowObject>(sheet, {
    raw: false,
    defval: "",
  });

  return { filename: file.name, headers, rows };
}

function findHeaderBySynonyms(headers: string[], synonyms: string[]): string | undefined {
  if (!headers.length) return undefined;
  const normalizedToOriginal: Record<string, string> = {};
  headers.forEach((h) => {
    normalizedToOriginal[normalizeString(h)] = h;
  });
  for (const syn of synonyms) {
    const n = normalizeString(syn);
    if (normalizedToOriginal[n]) return normalizedToOriginal[n];
  }
  return undefined;
}

function detectJoinKey(baseHeaders: string[], srcHeaders: string[]): string | undefined {
  const candidateGroups: string[][] = [
    ["상품명", "상품이름", "제품명", "name", "product", "title"],
    ["바코드", "barcode", "ean", "ean13", "ean-13", "qr", "qr코드"],
    ["상품코드", "상품 코드", "product code", "sku", "품번", "품목코드", "item code"],
  ];
  for (const group of candidateGroups) {
    const b = findHeaderBySynonyms(baseHeaders, group);
    const s = findHeaderBySynonyms(srcHeaders, group);
    if (b && s) return b; // 기준은 좌측(첫번째 파일)의 헤더명
  }
  // 교집합 이름이 동일한 경우(정규화 기준)
  const baseNorm = new Map<string, string>();
  baseHeaders.forEach((h) => baseNorm.set(normalizeString(h), h));
  for (const sh of srcHeaders) {
    const n = normalizeString(sh);
    const match = baseNorm.get(n);
    if (match) return match;
  }
  // 마지막 fallback: 첫 번째 컬럼
  return baseHeaders[0];
}

function computeMappings(baseHeaders: string[], srcHeaders: string[]): MappingInfo {
  const baseQtyKey =
    findHeaderBySynonyms(baseHeaders, [
      "재고수량",
      "재고 수량",
      "수량",
      "현재고",
      "재고",
    ]) || undefined;
  const baseLocKey =
    findHeaderBySynonyms(baseHeaders, [
      "상품 매장 진열 위치",
      "진열 위치",
      "매장 진열 위치",
      "매장위치",
      "위치",
    ]) || undefined;

  const baseVendorKey =
    findHeaderBySynonyms(baseHeaders, [
      "업체",
      "매장",
      "지점",
      "매장명",
    ]) || undefined;

  const srcQtyKey =
    findHeaderBySynonyms(srcHeaders, [
      "신논현재고",
      "신논 현재고",
      "현재고(신논현)",
      "신논현 현재고",
      "현재고 신논현",
    ]) || undefined;
  const srcLocKey =
    findHeaderBySynonyms(srcHeaders, [
      "진열위치 (신논현)",
      "진열위치(신논현)",
      "진열 위치 (신논현)",
      "신논현 진열 위치",
      "신논현 위치",
      "신논 진열 위치",
    ]) || undefined;

  // 신논현 전용 키 (명확히 구분)
  const srcQtyKeySinnonhyeon =
    findHeaderBySynonyms(srcHeaders, [
      "신논현재고",
      "신논 현재고",
      "현재고(신논현)",
      "신논현 현재고",
      "현재고 신논현",
    ]) || undefined;
  const srcLocKeySinnonhyeon =
    findHeaderBySynonyms(srcHeaders, [
      "진열위치(신논현)",
      "진열위치 (신논현)",
      "진열 위치 (신논현)",
      "신논현 진열 위치",
      "신논현 위치",
    ]) || undefined;

  // 논현 전용 키
  const srcQtyKeyNonhyeon =
    findHeaderBySynonyms(srcHeaders, [
      "논현재고",
      "논현 현재고",
      "현재고(논현)",
      "현재고 논현",
    ]) || undefined;
  const srcLocKeyNonhyeon =
    findHeaderBySynonyms(srcHeaders, [
      "진열위치(논현)",
      "진열위치 (논현)",
      "진열 위치 (논현)",
      "논현 진열 위치",
      "논현 위치",
    ]) || undefined;

  const joinKey = detectJoinKey(baseHeaders, srcHeaders);

  return {
    joinKey,
    baseQtyKey,
    baseLocKey,
    baseVendorKey,
    srcQtyKey,
    srcLocKey,
    srcQtyKeySinnonhyeon,
    srcLocKeySinnonhyeon,
    srcQtyKeyNonhyeon,
    srcLocKeyNonhyeon,
  };
}

function buildIndex(rows: RowObject[], key: string): Map<string, RowObject> {
  const idx = new Map<string, RowObject>();
  for (const row of rows) {
    const raw = row[key as keyof RowObject];
    const k = normalizeString(raw as unknown as string);
    if (k) idx.set(k, row);
  }
  return idx;
}

function valuesAreDifferent(a: unknown, b: unknown): boolean {
  return normalizeString(a) !== normalizeString(b);
}

export default function StockMergePage() {
  const [base, setBase] = useState<ParsedSheet | null>(null);
  const [src, setSrc] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<MappingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(false);
 

  const onChangeBase = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return setBase(null);
    try {
      const parsed = await parseFile(file);
      setBase(parsed);
      if (src) setMapping(computeMappings(parsed.headers, src.headers));
    } catch (err) {
      setError("첫번째 파일(기준) 파싱 중 오류가 발생했습니다.");
    }
  }, [src]);

  const onChangeSrc = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return setSrc(null);
    try {
      const parsed = await parseFile(file);
      setSrc(parsed);
      if (base) setMapping(computeMappings(base.headers, parsed.headers));
    } catch (err) {
      setError("두번째 파일(덮을 데이터) 파싱 중 오류가 발생했습니다.");
    }
  }, [base]);

  const merged = useMemo(() => {
    if (!base) return null;
    const info = mapping || (src ? computeMappings(base.headers, src.headers) : null);
    if (!info) return { rows: base.rows, changedCells: 0, changedRows: 0, info: null };

    const { joinKey, baseQtyKey, baseLocKey } = info;
    if (!src || !joinKey) return { rows: base.rows, changedCells: 0, changedRows: 0, info };

    const overlayIndex = buildIndex(src.rows, findHeaderBySynonyms(src.headers, [joinKey]) || joinKey);

    let changedCells = 0;
    let changedRows = 0;

    const rows = base.rows.map((row) => {
      const keyVal = normalizeString(row[joinKey as keyof RowObject]);
      const srcRow = overlayIndex.get(keyVal);
      if (!srcRow) return row;

      let rowChanged = false;
      const cloned: RowObject = { ...row };

      // 업체별로 소스 키 결정
      const vendorKey = (info as any).baseVendorKey as string | undefined;
      const vendorRaw = vendorKey ? row[vendorKey as keyof RowObject] : undefined;
      const vendor = normalizeString(vendorRaw as unknown as string);
      const isNonhyeon = vendor === normalizeString("라페어 논현점");
      const isSinnonhyeon = vendor === normalizeString("라페어 신논현점");

      const chosenQtyKey = isNonhyeon
        ? (info as any).srcQtyKeyNonhyeon || (info as any).srcQtyKey || (info as any).srcQtyKeySinnonhyeon
        : isSinnonhyeon
        ? (info as any).srcQtyKeySinnonhyeon || (info as any).srcQtyKey
        : (info as any).srcQtyKey || (info as any).srcQtyKeySinnonhyeon || (info as any).srcQtyKeyNonhyeon;

      const chosenLocKey = isNonhyeon
        ? (info as any).srcLocKeyNonhyeon || (info as any).srcLocKey || (info as any).srcLocKeySinnonhyeon
        : isSinnonhyeon
        ? (info as any).srcLocKeySinnonhyeon || (info as any).srcLocKey
        : (info as any).srcLocKey || (info as any).srcLocKeySinnonhyeon || (info as any).srcLocKeyNonhyeon;

      // 재고수량
      if (baseQtyKey && chosenQtyKey) {
        const current = row[baseQtyKey as keyof RowObject];
        const incoming = srcRow[chosenQtyKey as keyof RowObject];
        if (incoming !== undefined && incoming !== null && valuesAreDifferent(current, incoming)) {
          cloned[baseQtyKey] = incoming;
          (cloned as any)[`__changed__${baseQtyKey}`] = true;
          (cloned as any)[`__prev__${baseQtyKey}`] = current;
          changedCells += 1;
          rowChanged = true;
        }
      }

      // 상품 매장 진열 위치
      if (baseLocKey && chosenLocKey) {
        const current = row[baseLocKey as keyof RowObject];
        const incoming = srcRow[chosenLocKey as keyof RowObject];
        if (incoming !== undefined && incoming !== null && valuesAreDifferent(current, incoming)) {
          cloned[baseLocKey] = incoming;
          (cloned as any)[`__changed__${baseLocKey}`] = true;
          (cloned as any)[`__prev__${baseLocKey}`] = current;
          changedCells += 1;
          rowChanged = true;
        }
      }

      if (rowChanged) changedRows += 1;
      return cloned;
    });

    return { rows, changedCells, changedRows, info };
  }, [base, src, mapping]);

  const downloadExcel = useCallback(() => {
    if (!base) return;
    const dataRows = (merged ? merged.rows : base.rows) as RowObject[];
    // 내부 플래그 컬럼 제거
    const cleaned = dataRows.map((r) => {
      const c: RowObject = {};
      Object.keys(r).forEach((k) => {
        if (!k.startsWith("__changed__")) c[k] = (r as any)[k];
      });
      return c;
    });

    const ws = XLSX.utils.json_to_sheet(cleaned, { header: base.headers.length ? base.headers : undefined });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `merged_${base.filename.replace(/\.(xlsx|xls|csv)$/i, "")}.xlsx`);
  }, [base, merged]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">재고 덮어쓰기 (신논현 기준)</h1>
      <p className="text-sm text-gray-600 mb-6">
        첫번째 파일 형식을 그대로 보여주고, 두번째 파일의 "신논현재고"와 "진열위치 (신논현)"를
        각각 "재고수량", "상품 매장 진열 위치"에 덮어씁니다. 변경된 셀은 색상으로 표시됩니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="border rounded-lg p-4">
          <h2 className="font-medium mb-2">첫번째 파일 (기준)</h2>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onChangeBase} className="block w-full text-sm" />
          {base && (
            <div className="mt-3 text-sm text-gray-700">
              <div>파일명: {base.filename}</div>
              <div>행 수: {base.rows.length}</div>
              <div>열 수: {base.headers.length}</div>
            </div>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="font-medium mb-2">두번째 파일 (덮을 데이터)</h2>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onChangeSrc} className="block w-full text-sm" />
          {src && (
            <div className="mt-3 text-sm text-gray-700">
              <div>파일명: {src.filename}</div>
              <div>행 수: {src.rows.length}</div>
              <div>열 수: {src.headers.length}</div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-red-600 text-sm" role="alert">{error}</div>
      )}

      <div className="flex items-center gap-4 mb-4">
        
        <button onClick={downloadExcel} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50" disabled={!base}>엑셀 다운로드</button>
      </div>

      {merged && (
        <div className="mb-4 text-sm text-gray-700">
          <div className="flex flex-wrap gap-3">
            <span className="px-2 py-1 bg-gray-100 rounded">변경된 셀: {merged.changedCells}</span>
            <span className="px-2 py-1 bg-gray-100 rounded">변경된 행: {merged.changedRows}</span>
            {merged.info && (
              <span className="px-2 py-1 bg-gray-100 rounded">
                기준키: {merged.info.joinKey || "(자동 감지 실패)"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 테이블 렌더링: 첫번째 파일의 헤더 순서 유지 */}
      {base && (
        <div className="table-scroll border rounded-lg overflow-auto">
          <table className="min-w-max text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {base.headers.map((h) => (
                  <th key={h} className="text-left px-2 py-1 border-b border-gray-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(merged ? merged.rows : base.rows).map((row, idx) => (
                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                  {base.headers.map((h) => {
                    const value = row[h as keyof RowObject] as unknown as string;
                    const changedFlag = (row as any)[`__changed__${h}`] === true;
                    const prevValue = (row as any)[`__prev__${h}`] as unknown as string | undefined;
                    const cellClass = changedFlag ? "bg-yellow-100" : "";
                    return (
                      <td key={h} className={`px-2 py-1 border-b border-gray-100 align-top whitespace-nowrap ${cellClass}`}>
                        {changedFlag && !previewEnabled && prevValue !== undefined ? (
                          <span>
                            <span className="text-gray-400">{String(prevValue)}</span>
                            <span className="mx-1 text-gray-300">→</span>
                            <span className="text-gray-900 font-medium">{String(value ?? "")}</span>
                          </span>
                        ) : (
                          <span>{String(value ?? "")}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


