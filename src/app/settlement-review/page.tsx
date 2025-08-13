"use client";

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type TobeRow = {
  승인번호: string;
  승인일?: string;
  거래금액: number;
  비고?: string;
};

type AdminRow = {
  승인번호: string;
  결제일시?: string;
  매출금액: number;
};

type ComparisonRow = {
  승인번호: string;
  승인일?: string;
  결제일시?: string;
  tobeAmount?: number;
  adminAmount?: number;
  difference: number;
  status: "일치" | "불일치" | "투비만 있음" | "관리자만 있음";
  비고?: string;
};

function parseMoney(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function normalizeApproval(value: unknown): string {
  const s = String(value ?? "").trim();
  const digits = s.replace(/\D/g, "");
  return digits;
}

function findColumnKey(row: Record<string, unknown>, contains: string): string | undefined {
  const lower = contains.toLowerCase();
  return Object.keys(row).find((k) => k.toLowerCase().includes(lower));
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
        resolve(jsonData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function aggregateByApproval<T extends { 승인번호: string }>(rows: T[], getAmount: (row: T) => number) {
  const map = new Map<string, { amount: number; sample: T }>();
  for (const row of rows) {
    const key = normalizeApproval(row.승인번호);
    if (!key) continue;
    const prev = map.get(key);
    const amount = getAmount(row);
    if (prev) {
      prev.amount += amount;
    } else {
      map.set(key, { amount, sample: row });
    }
  }
  return map;
}

export default function SettlementReviewPage() {
  const [tobeRows, setTobeRows] = useState<TobeRow[] | null>(null);
  const [adminRows, setAdminRows] = useState<AdminRow[] | null>(null);
  const [onlyMismatches, setOnlyMismatches] = useState(false);
  const [remarkFilter, setRemarkFilter] = useState<string>("");
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<{ tobe: boolean; admin: boolean }>({ tobe: false, admin: false });

  const handleTobeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;
    setLoading((p) => ({ ...p, tobe: true }));
    try {
      const raw = await readFirstSheet(file);
      const parsed: TobeRow[] = raw
        .map((row) => {
          const kApproval = findColumnKey(row, "승인번호");
          const kDate = findColumnKey(row, "승인일");
          const kAmount = findColumnKey(row, "거래금액");
          const kMemo = findColumnKey(row, "비고");
          const 승인번호 = String(kApproval ? row[kApproval] ?? "" : "").trim();
          const 승인일 = kDate ? String(row[kDate] ?? "").trim() : undefined;
          const 거래금액 = parseMoney(kAmount ? row[kAmount] : 0);
          const 비고 = kMemo ? String(row[kMemo] ?? "").trim() : undefined;
          return { 승인번호, 승인일, 거래금액, 비고 };
        })
        .filter((r) => normalizeApproval(r.승인번호));
      setTobeRows(parsed);
    } catch (err) {
      console.error(err);
      alert("투비 정산보고파일 처리 중 오류가 발생했습니다. 양식을 확인해주세요.");
    } finally {
      setLoading((p) => ({ ...p, tobe: false }));
      inputEl.value = "";
    }
  };

  const handleAdminUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;
    setLoading((p) => ({ ...p, admin: true }));
    try {
      const raw = await readFirstSheet(file);
      const parsed: AdminRow[] = raw
        .map((row) => {
          const kApproval = findColumnKey(row, "승인번호");
          const kDate = findColumnKey(row, "결제일시") ?? findColumnKey(row, "구매일시");
          const kAmount =
            findColumnKey(row, "매출금액(배송비포함)") ??
            findColumnKey(row, "주문금액") ??
            findColumnKey(row, "결제금액");
          const 승인번호 = String(kApproval ? row[kApproval] ?? "" : "").trim();
          const 결제일시 = kDate ? String(row[kDate] ?? "").trim() : undefined;
          const 매출금액 = parseMoney(kAmount ? row[kAmount] : 0);
          return { 승인번호, 결제일시, 매출금액 };
        })
        .filter((r) => normalizeApproval(r.승인번호));
      setAdminRows(parsed);
    } catch (err) {
      console.error(err);
      alert("관리자 매출파일 처리 중 오류가 발생했습니다. 양식을 확인해주세요.");
    } finally {
      setLoading((p) => ({ ...p, admin: false }));
      inputEl.value = "";
    }
  };

  const comparison = useMemo(() => {
    if (!tobeRows && !adminRows) return [] as ComparisonRow[];
    const tobeMap = tobeRows ? aggregateByApproval(tobeRows, (r) => r.거래금액) : new Map<string, { amount: number; sample: TobeRow }>();
    const adminMap = adminRows ? aggregateByApproval(adminRows, (r) => r.매출금액) : new Map<string, { amount: number; sample: AdminRow }>();
    const keys = new Set<string>([...tobeMap.keys(), ...adminMap.keys()]);

    const rows: ComparisonRow[] = [];
    for (const key of keys) {
      const t = tobeMap.get(key);
      const a = adminMap.get(key);
      const tobeAmount = t?.amount;
      const adminAmount = a?.amount;
      const difference = (tobeAmount ?? 0) - (adminAmount ?? 0);
      let status: ComparisonRow["status"] = "일치";
      if (t && a) {
        status = Math.abs(difference) < 1 ? "일치" : "불일치"; // 1원 미만은 동일로 간주
      } else if (t && !a) {
        status = "투비만 있음";
      } else if (!t && a) {
        status = "관리자만 있음";
      }
      rows.push({
        승인번호: key,
        승인일: t?.sample.승인일,
        결제일시: (a?.sample as AdminRow | undefined)?.결제일시,
        tobeAmount,
        adminAmount,
        difference,
        status,
        비고: t?.sample.비고,
      });
    }

    rows.sort((x, y) => x.승인번호.localeCompare(y.승인번호));
    return rows;
  }, [tobeRows, adminRows]);

  const rowsAfterMismatch = useMemo(() => {
    const base = onlyMismatches ? comparison.filter((r) => r.status !== "일치") : comparison;
    if (!remarkFilter) return base;
    if (remarkFilter === "__EMPTY__") {
      return base.filter((r) => !(r.비고 && r.비고.trim()));
    }
    const target = remarkFilter.trim();
    return base.filter((r) => (r.비고 ?? "").trim() === target);
  }, [comparison, onlyMismatches, remarkFilter]);

  const summary = useMemo(() => {
    const included = rowsAfterMismatch.filter((r) => !excludedKeys.has(r.승인번호));
    const totalTobe = included.reduce((s, r) => s + (r.tobeAmount ?? 0), 0);
    const totalAdmin = included.reduce((s, r) => s + (r.adminAmount ?? 0), 0);
    const totalKeys = included.length;
    const matched = included.filter((r) => r.status === "일치").length;
    const mismatched = included.filter((r) => r.status === "불일치").length;
    const onlyTobe = included.filter((r) => r.status === "투비만 있음").length;
    const onlyAdmin = included.filter((r) => r.status === "관리자만 있음").length;
    const totalDiff = included.reduce((s, r) => s + r.difference, 0);
    return { totalTobe, totalAdmin, totalKeys, matched, mismatched, onlyTobe, onlyAdmin, totalDiff };
  }, [rowsAfterMismatch, excludedKeys]);

  const rowsToRender = rowsAfterMismatch;

  const remarkOptions = useMemo(() => {
    const set = new Set<string>();
    (tobeRows ?? []).forEach((r) => {
      const v = (r.비고 ?? "").trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tobeRows]);

  const formatCurrency = (n?: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n ?? 0));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">정산결과 검토</h1>
          <p className="text-gray-600">두 개의 엑셀 파일을 업로드하고 승인번호 기준으로 금액을 비교합니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold text-gray-900 mb-2">투비 정산보고파일</h2>
            <p className="text-sm text-gray-500 mb-4">필수 컬럼: 승인일, 거래금액, 승인번호, 비고</p>
            <label htmlFor="tobe-upload" className="inline-block cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded">
              파일 선택
            </label>
            <input id="tobe-upload" type="file" className="sr-only" accept=".xlsx,.xls" onChange={handleTobeUpload} />
            {loading.tobe && <p className="mt-3 text-sm text-gray-500">처리 중...</p>}
            {tobeRows && (
              <div className="mt-3 text-sm text-gray-700">
                <p>읽은 행 수: <span className="font-semibold">{tobeRows.length.toLocaleString()}행</span></p>
                <p>총 거래금액: <span className="font-semibold text-green-600">₩{formatCurrency(summary.totalTobe)}</span></p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold text-gray-900 mb-2">관리자 매출파일</h2>
            <p className="text-sm text-gray-500 mb-4">필수 컬럼: 매출금액(배송비포함), 승인번호, 결제일시</p>
            <label htmlFor="admin-upload" className="inline-block cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded">
              파일 선택
            </label>
            <input id="admin-upload" type="file" className="sr-only" accept=".xlsx,.xls" onChange={handleAdminUpload} />
            {loading.admin && <p className="mt-3 text-sm text-gray-500">처리 중...</p>}
            {adminRows && (
              <div className="mt-3 text-sm text-gray-700">
                <p>읽은 행 수: <span className="font-semibold">{adminRows.length.toLocaleString()}행</span></p>
                <p>총 매출금액: <span className="font-semibold text-green-600">₩{formatCurrency(summary.totalAdmin)}</span></p>
              </div>
            )}
          </div>
        </div>

        {(tobeRows || adminRows) && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">비교 결과</h3>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="rounded" checked={onlyMismatches} onChange={(e) => setOnlyMismatches(e.target.checked)} />
                  불일치/누락만 보기
                </label>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span>비고 필터:</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={remarkFilter}
                    onChange={(e) => setRemarkFilter(e.target.value)}
                  >
                    <option value="">전체</option>
                    <option value="__EMPTY__">비고 없음</option>
                    {remarkOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm bg-gray-50">
              <div>
                <span className="text-gray-500">총 승인번호:</span>
                <span className="ml-2 font-semibold">{summary.totalKeys.toLocaleString()}건</span>
              </div>
              <div>
                <span className="text-gray-500">일치:</span>
                <span className="ml-2 font-semibold text-green-600">{summary.matched.toLocaleString()}건</span>
              </div>
              <div>
                <span className="text-gray-500">불일치:</span>
                <span className="ml-2 font-semibold text-red-600">{summary.mismatched.toLocaleString()}건</span>
              </div>
              <div>
                <span className="text-gray-500">투비만 있음:</span>
                <span className="ml-2 font-semibold">{summary.onlyTobe.toLocaleString()}건</span>
              </div>
              <div>
                <span className="text-gray-500">관리자만 있음:</span>
                <span className="ml-2 font-semibold">{summary.onlyAdmin.toLocaleString()}건</span>
              </div>
              <div>
                <span className="text-gray-500">총 차이(투비-관리자):</span>
                <span className="ml-2 font-semibold">₩{formatCurrency(summary.totalDiff)}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">제외</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">승인번호</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">승인일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">결제일시</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">거래금액(투비)</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">매출금액(관리자)</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">차이</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rowsToRender.map((row) => (
                    <tr key={row.승인번호} className={(row.status === "불일치" ? "bg-red-50 " : row.status === "일치" ? "" : "bg-amber-50 ") + (excludedKeys.has(row.승인번호) ? "opacity-60" : "") }>
                      <td className="px-4 py-2 whitespace-nowrap text-center">
                        <input
                          type="checkbox"
                          checked={excludedKeys.has(row.승인번호)}
                          onChange={(e) => {
                            setExcludedKeys((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(row.승인번호); else next.delete(row.승인번호);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900">{row.승인번호}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">{row.승인일 ?? "-"}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">{row.결제일시 ?? "-"}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-900">{row.tobeAmount != null ? `₩${formatCurrency(row.tobeAmount)}` : "-"}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-right text-gray-900">{row.adminAmount != null ? `₩${formatCurrency(row.adminAmount)}` : "-"}</td>
                      <td className={"px-6 py-2 whitespace-nowrap text-sm text-right " + (Math.abs(row.difference) < 1 ? "text-gray-700" : "text-red-600 font-semibold")}> {`₩${formatCurrency(row.difference)}`} </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm ">
                        <span className={
                          row.status === "일치"
                            ? "text-green-700"
                            : row.status === "불일치"
                            ? "text-red-700"
                            : "text-amber-700"
                        }>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">{row.비고 ?? ""}</td>
                    </tr>
                  ))}
                  {rowsToRender.length === 0 && (
                    <tr>
                      <td className="px-6 py-6 text-center text-sm text-gray-500" colSpan={9}>표시할 데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


