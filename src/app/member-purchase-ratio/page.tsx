"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type PeriodType = "monthly" | "weekly" | "daily";

type PurchaseRow = {
  매장: string;
  회원여부: boolean;
  결제일시: string | undefined;
  구매월: string | undefined;
  구매주: string | undefined;
  구매일: string | undefined;
};

type StoreAgg = {
  매장: string;
  전체: number;
  회원: number;
  비회원: number;
  회원비율: number;
};

/** 매출소속(업체명)이 이 값이면 집계·표시 모두 제외 */
const EXCLUDED_STORE_NAME = "라페어";

type ParsedRowWithOrderNo = PurchaseRow & { 주문번호: string };

function dedupeByOrderNumber(rows: ParsedRowWithOrderNo[]): PurchaseRow[] {
  const seen = new Set<string>();
  const out: PurchaseRow[] = [];
  for (const r of rows) {
    const key = r.주문번호.trim();
    const { 주문번호: _drop, ...rest } = r;
    if (!key) {
      out.push(rest);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rest);
  }
  return out;
}

function findColumnKey(row: Record<string, unknown>, contains: string): string | undefined {
  const lower = contains.toLowerCase();
  return Object.keys(row).find((k) => k.toLowerCase().includes(lower));
}

type XlsxDate = { y?: number; m?: number; d?: number };

function safeParseXlsxDate(value: number): XlsxDate | undefined {
  const ssf = (XLSX as unknown as { SSF?: { parse_date_code?: (v: number) => XlsxDate } }).SSF;
  const fn = ssf?.parse_date_code;
  if (typeof fn !== "function") return undefined;
  return fn(value);
}

function toDateKey(raw: string | number | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    const d = safeParseXlsxDate(raw);
    if (d && d.y && d.m && d.d) {
      const y = d.y;
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    return undefined;
  }
  const s = String(raw).trim();
  // 엑셀에서 날짜가 문자열 숫자(시리얼)로 올 때
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 200) {
      const d = safeParseXlsxDate(n);
      if (d && d.y && d.m && d.d) {
        const y = d.y;
        const m = String(d.m).padStart(2, "0");
        const day = String(d.d).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    }
  }
  if (!s) return undefined;
  const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const da = m[3].padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return undefined;
}

function toMonthKey(dateKey: string | undefined): string | undefined {
  if (!dateKey) return undefined;
  const m = dateKey.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : undefined;
}

function getWeekMonday(dateKey: string): Date | undefined {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dayOfWeek = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
  return monday;
}

function fmtDate(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function toWeekKey(dateKey: string | undefined): string | undefined {
  if (!dateKey) return undefined;
  const monday = getWeekMonday(dateKey);
  if (!monday) return undefined;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${fmtDate(monday)} ~ ${fmtDate(sunday)}`;
}

function weekKeyToLabel(weekKey: string): string {
  const m = weekKey.match(/^(\d{4})-(\d{2})-(\d{2}) ~ (\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return weekKey;
  const monMonth = Number(m[2]);
  const monDay = Number(m[3]);
  const sunDay = Number(m[6]);
  // 해당 월의 몇 번째 주인지 계산 (월요일 기준)
  const weekNum = Math.ceil(monDay / 7);
  return `${monMonth}월 ${weekNum}주차 (${monMonth}/${monDay} ~ ${monMonth === Number(m[5]) ? "" : Number(m[5]) + "/"}${sunDay})`;
}

function readFirstSheet(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          resolve([]);
          return;
        }
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: false,
        }) as Record<string, unknown>[];
        resolve(jsonData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function parsePurchaseRows(raw: Record<string, unknown>[]): PurchaseRow[] {
  const mapped = raw.map((row) => {
    const kStore = findColumnKey(row, "매출소속");
    const kOrderer = findColumnKey(row, "주문자");
    const kOrderNo = findColumnKey(row, "주문번호");
    const kPay = findColumnKey(row, "결제일시") ?? findColumnKey(row, "결제일");

    const storeRaw = kStore ? row[kStore] : "";
    const 매장 = String(storeRaw ?? "").trim() || "(매장 미지정)";

    const ordererRaw = kOrderer ? row[kOrderer] : "";
    const ordererStr = String(ordererRaw ?? "").trim();
    const 회원여부 = ordererStr.length > 0;

    const orderNoRaw = kOrderNo ? row[kOrderNo] : "";
    const 주문번호 = String(orderNoRaw ?? "").trim();

    const payRaw = kPay ? row[kPay] : undefined;
    const 결제일시 = toDateKey(
      typeof payRaw === "number" || typeof payRaw === "string"
        ? payRaw
        : payRaw != null
          ? String(payRaw)
          : undefined
    );

    const 구매월 = toMonthKey(결제일시);
    const 구매주 = toWeekKey(결제일시);
    const 구매일 = 결제일시;

    return { 매장, 회원여부, 결제일시, 구매월, 구매주, 구매일, 주문번호 };
  });

  const afterExclude = mapped.filter((r) => r.매장 !== EXCLUDED_STORE_NAME);
  return dedupeByOrderNumber(afterExclude);
}

function CalendarPopup({
  selected,
  onSelect,
  dataDates,
}: {
  selected: string | null;
  onSelect: (date: string | null) => void;
  dataDates: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = selected ?? "날짜 선택";

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 flex items-center gap-2"
        >
          <span>{label}</span>
          <span className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className="px-2 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-gray-500"
          >
            전체
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50">
          <MiniCalendar
            selected={selected}
            onSelect={(d) => { onSelect(d); setOpen(false); }}
            dataDates={dataDates}
          />
        </div>
      )}
    </div>
  );
}

function MiniCalendar({
  selected,
  onSelect,
  dataDates,
}: {
  selected: string | null;
  onSelect: (date: string | null) => void;
  dataDates: Set<string>;
}) {
  const initDate = selected
    ? new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, 1)
    : new Date();
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // 월=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const makeDateStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">◀</button>
        <span className="text-sm font-semibold text-gray-800">{viewYear}년 {viewMonth + 1}월</span>
        <button type="button" onClick={nextMonth} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-gray-500 mb-1">
        {["월","화","수","목","금","토","일"].map((d) => <div key={d} className="py-1 font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const dateStr = makeDateStr(day);
          const hasData = dataDates.has(dateStr);
          const isSelected = dateStr === selected;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(isSelected ? null : dateStr)}
              className={`py-1.5 rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white font-semibold"
                  : hasData
                    ? "bg-blue-100 text-blue-800 font-medium hover:bg-blue-200"
                    : "text-gray-400 cursor-default"
              }`}
              disabled={!hasData}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MemberPurchaseRatioPage() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodFilter, setPeriodFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<"매장" | "회원비율" | "전체">("회원비율");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const dataDatesSet = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.구매일) s.add(r.구매일); });
    return s;
  }, [rows]);

  const periodFieldKey = periodType === "monthly" ? "구매월" : periodType === "weekly" ? "구매주" : "구매일";
  const periodLabel = periodType === "monthly" ? "월별" : periodType === "weekly" ? "주별" : "일별";

  const availablePeriods = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = r[periodFieldKey];
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, periodFieldKey]);

  const filteredRows = useMemo(() => {
    if (periodFilter === "ALL") return rows;
    return rows.filter((r) => r[periodFieldKey] === periodFilter);
  }, [rows, periodFilter, periodFieldKey]);

  const overall = useMemo(() => {
    let 회원 = 0;
    let 비회원 = 0;
    filteredRows.forEach((r) => {
      if (r.회원여부) 회원 += 1;
      else 비회원 += 1;
    });
    const 전체 = 회원 + 비회원;
    const 회원비율 = 전체 > 0 ? (회원 / 전체) * 100 : 0;
    return { 전체, 회원, 비회원, 회원비율 };
  }, [filteredRows]);

  const byStore = useMemo(() => {
    const map = new Map<string, { 회원: number; 비회원: number }>();
    for (const r of filteredRows) {
      const cur = map.get(r.매장) ?? { 회원: 0, 비회원: 0 };
      if (r.회원여부) cur.회원 += 1;
      else cur.비회원 += 1;
      map.set(r.매장, cur);
    }
    const list: StoreAgg[] = [];
    map.forEach((v, 매장) => {
      const 전체 = v.회원 + v.비회원;
      const 회원비율 = 전체 > 0 ? (v.회원 / 전체) * 100 : 0;
      list.push({
        매장,
        전체,
        회원: v.회원,
        비회원: v.비회원,
        회원비율,
      });
    });

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "매장") return dir * a.매장.localeCompare(b.매장, "ko");
      if (sortKey === "전체") return dir * (a.전체 - b.전체);
      return dir * (a.회원비율 - b.회원비율);
    });
    return list;
  }, [filteredRows, sortKey, sortDir]);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const raw = await readFirstSheet(file);
      if (raw.length === 0) {
        setError("시트에 데이터가 없습니다.");
        setRows([]);
        setFilename(null);
        return;
      }
      const parsed = parsePurchaseRows(raw);
      if (parsed.length === 0) {
        setError("집계할 데이터가 없습니다. 매출소속이 「라페어」인 행은 통계에서 제외됩니다.");
        setRows([]);
        setFilename(file.name);
        setPeriodFilter("ALL");
        return;
      }
      setRows(parsed);
      setFilename(file.name);
      setPeriodFilter("ALL");
    } catch {
      setError("파일을 읽는 중 오류가 발생했습니다. 엑셀 형식을 확인해 주세요.");
      setRows([]);
      setFilename(null);
    } finally {
      setLoading(false);
      input.value = "";
    }
  }, []);

  const pct = (n: number) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(
      Number.isFinite(n) ? n : 0
    );

  return (
    <div className="min-h-screen w-full min-w-0 max-w-full overflow-x-auto bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 min-w-0">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">회원구매 비율</h1>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">엑셀 파일 업로드</label>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="member-purchase-file"
              className={`inline-flex cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              파일 선택
            </label>
            <input
              id="member-purchase-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFile}
              disabled={loading}
              className="sr-only"
            />
          </div>
          {filename && (
            <p className="mt-3 text-sm text-gray-600">
              불러온 파일: <span className="font-medium">{filename}</span> · 행 {rows.length}건
            </p>
          )}
          {loading && (
            <p className="mt-2 text-sm text-blue-600">처리 중…</p>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        {rows.length > 0 && !loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide">전체 구매 건수</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{overall.전체.toLocaleString()}건</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide">회원 구매</div>
                <div className="text-2xl font-semibold text-emerald-700 mt-1">{overall.회원.toLocaleString()}건</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wide">비회원 구매</div>
                <div className="text-2xl font-semibold text-slate-600 mt-1">{overall.비회원.toLocaleString()}건</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4 border border-blue-50 bg-gradient-to-br from-white to-blue-50/80">
                <div className="text-xs text-gray-500 uppercase tracking-wide">전체 회원 구매 비율</div>
                <div className="text-2xl font-semibold text-blue-700 mt-1">{pct(overall.회원비율)}%</div>
                <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, overall.회원비율)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">기간</span>
                <select
                  value={periodType}
                  onChange={(e) => {
                    const newType = e.target.value as PeriodType;
                    setPeriodType(newType);
                    if (newType === "weekly" || newType === "daily") {
                      const fieldKey = newType === "weekly" ? "구매주" : "구매일";
                      const s = new Set<string>();
                      rows.forEach((r) => { const v = r[fieldKey]; if (v) s.add(v); });
                      const sorted = Array.from(s).sort();
                      setPeriodFilter(sorted.length > 0 ? sorted[sorted.length - 1] : "ALL");
                    } else {
                      setPeriodFilter("ALL");
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="monthly">월별</option>
                  <option value="weekly">주별</option>
                  <option value="daily">일별</option>
                </select>
              </div>
              {availablePeriods.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="period-filter" className="text-sm text-gray-600">
                    {periodLabel}
                  </label>
                  {periodType === "daily" ? (
                    <CalendarPopup
                      selected={periodFilter === "ALL" ? null : periodFilter}
                      onSelect={(d) => setPeriodFilter(d ?? "ALL")}
                      dataDates={dataDatesSet}
                    />
                  ) : periodType === "weekly" ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={availablePeriods.indexOf(periodFilter) <= 0}
                        onClick={() => {
                          const idx = availablePeriods.indexOf(periodFilter);
                          if (idx > 0) setPeriodFilter(availablePeriods[idx - 1]);
                        }}
                        className="px-2 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ◀
                      </button>
                      <span className="text-sm font-medium text-gray-800 min-w-[180px] text-center">
                        {weekKeyToLabel(periodFilter)}
                      </span>
                      <button
                        type="button"
                        disabled={availablePeriods.indexOf(periodFilter) >= availablePeriods.length - 1}
                        onClick={() => {
                          const idx = availablePeriods.indexOf(periodFilter);
                          if (idx >= 0 && idx < availablePeriods.length - 1) setPeriodFilter(availablePeriods[idx + 1]);
                        }}
                        className="px-2 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ▶
                      </button>
                    </div>
                  ) : (
                    <select
                      id="period-filter"
                      value={periodFilter}
                      onChange={(e) => setPeriodFilter(e.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="ALL">전체</option>
                      {availablePeriods.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">정렬</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="회원비율">회원 비율</option>
                  <option value="전체">구매 건수</option>
                  <option value="매장">매장명</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                >
                  {sortDir === "desc" ? "높은 순" : "낮은 순"}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">매장별 회원 구매 비율</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        매장 (매출소속)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        전체
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        회원
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        비회원
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                        회원 비율
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {byStore.map((s) => (
                      <tr key={s.매장} className="hover:bg-gray-50/80">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {s.매장}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 text-right tabular-nums">
                          {s.전체.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-emerald-700 text-right tabular-nums font-medium">
                          {s.회원.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right tabular-nums">
                          {s.비회원.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-blue-700 tabular-nums w-14 text-right">
                              {pct(s.회원비율)}%
                            </span>
                            <div className="flex-1 min-w-[120px] h-2.5 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                                style={{ width: `${Math.min(100, s.회원비율)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
