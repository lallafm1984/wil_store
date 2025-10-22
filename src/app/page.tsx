"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface ProductData {
  상품명: string;
  수량: number;
  매출금액: number;
  개별금액?: number;
  구매UID?: string;
  결제일시?: string; // YYYY-MM-DD
  구매월?: string; // YYYY-MM
  구매일?: string; // YYYY-MM-DD
}

interface GroupedProductData {
  mainProduct: ProductData;
  sizeProducts: ProductData[];
}

interface ExcelRow {
  [key: string]: string | number;
}

export default function Home() {
  const [groupedData, setGroupedData] = useState<GroupedProductData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [productRefsByName, setProductRefsByName] = useState<Record<string, { 품번?: string; 품목코드?: string }>>({});
  const [totalPaidAmount, setTotalPaidAmount] = useState(0);
  const [bagPointAdjustment, setBagPointAdjustment] = useState(0);
  const [stockByName, setStockByName] = useState<Record<string, { qty?: number; location?: string }>>({});
  const [stockLoadedCount, setStockLoadedCount] = useState(0);
  const [allRows, setAllRows] = useState<ProductData[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('ALL');

  const recomputeForScope = (rows: ProductData[]) => {
    const totalPaid = rows.reduce((sum, item) => sum + (item.매출금액 || 0), 0);
    const { bagPointAdjustment: bagAdj } = adjustQuantitiesByUidMismatch(rows);
    setTotalPaidAmount(totalPaid);
    setBagPointAdjustment(bagAdj);
    const aggregatedData = aggregateDataByProduct(rows);
    const grouped = groupProductsBySize(aggregatedData);
    setGroupedData(grouped);
  };

  // 일자별 재고 가산 계산: 선택한 구매일 이전까지의 판매 수량을 재고에 가산
  const adjustedStockByName = useMemo(() => {
    // 기본: 업로드된 재고 수량 그대로
    if (!stockByName || Object.keys(stockByName).length === 0) return stockByName;
    if (!selectedDay || selectedDay === 'ALL') return stockByName;

    // 구매일별 원본 rows에서 선택일 이후 판매 수량 합산
    // 예시 요구사항에 맞추어: 선택일보다 이후 날짜의 판매 수량은 재고에 아직 반영되지 않았다고 보고 재고에 더함
    const laterSaleCountByName: Record<string, number> = {};
    allRows.forEach((row) => {
      if (!row.구매일) return;
      if (row.구매일 > selectedDay) {
        laterSaleCountByName[row.상품명] = (laterSaleCountByName[row.상품명] || 0) + Number(row.수량 || 0);
      }
    });

    const adjusted: Record<string, { qty?: number; location?: string }> = {};
    Object.entries(stockByName).forEach(([name, info]) => {
      const add = laterSaleCountByName[name] || 0;
      adjusted[name] = {
        qty: (info.qty ?? undefined) !== undefined ? (Number(info.qty) + add) : undefined,
        location: info.location,
      };
    });
    return adjusted;
  }, [stockByName, allRows, selectedDay]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const data = await readExcelFile(file);
      setAllRows(data);
      const daySet = new Set<string>();
      data.forEach((r) => { if (r.구매일) daySet.add(r.구매일); });
      const days = Array.from(daySet).sort();
      setAvailableDays(days);
      setSelectedDay('ALL');
      recomputeForScope(data);
    } catch (error) {
      console.error("파일 처리 중 오류가 발생했습니다:", error);
      alert("파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadProductRefs = async () => {
      try {
        const res = await fetch('/참조상품.csv');
        if (!res.ok) return;
        const text = await res.text();
        const map = parseProductCsv(text);
        setProductRefsByName(map);
      } catch (e) {
        console.error('참조상품 CSV 로드 실패', e);
      }
    };
    loadProductRefs();
  }, []);

  const parseProductCsv = (text: string): Record<string, { 품번?: string; 품목코드?: string }> => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const map: Record<string, { 품번?: string; 품목코드?: string }> = {};
    // Expect header: 상품명,품번,품목코드
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const name = (parts[0] ?? '').trim();
      const code = (parts[1] ?? '').trim();
      const itemCode = (parts[2] ?? '').trim();
      if (!name) continue;
      map[name] = { 품번: code || undefined, 품목코드: itemCode || undefined };
    }
    return map;
  };

  type XlsxDate = { y?: number; m?: number; d?: number };

  const safeParseXlsxDate = (value: number): XlsxDate | undefined => {
    const ssf = (XLSX as unknown as { SSF?: { parse_date_code?: (v: number) => XlsxDate } }).SSF;
    const fn = ssf?.parse_date_code;
    if (typeof fn !== 'function') return undefined;
    return fn(value);
  };

  // 결제일시 값을 YYYY-MM-DD로 표준화
  const toDateKey = (raw: string | number | undefined): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'number') {
      const d = safeParseXlsxDate(raw);
      if (d && d.y && d.m && d.d) {
        const y = d.y;
        const m = String(d.m).padStart(2, '0');
        const day = String(d.d).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return undefined;
    }
    const s = String(raw).trim();
    if (!s) return undefined;
    const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) {
      const y = m[1];
      const mo = m[2].padStart(2, '0');
      const da = m[3].padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    }
    return undefined;
  };

  // 구매일시(yyyymmddhhmmss)에서 YYYY-MM 추출
  const toMonthKeyFromPurchase = (raw: string | number | undefined): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    let s = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw).trim();
    // 숫자만 남기기
    s = s.replace(/[^0-9]/g, '');
    if (s.length < 6) return undefined;
    const yyyy = s.slice(0, 4);
    const mm = s.slice(4, 6);
    if (!/^[0-9]{4}$/.test(yyyy) || !/^(0[1-9]|1[0-2])$/.test(mm)) return undefined;
    return `${yyyy}-${mm}`;
  };

  // 구매일시(yyyymmddhhmmss)에서 YYYY-MM-DD 추출
  const toDayKeyFromPurchase = (raw: string | number | undefined): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    let s = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw).trim();
    s = s.replace(/[^0-9]/g, '');
    if (s.length < 8) return undefined;
    const yyyy = s.slice(0, 4);
    const mm = s.slice(4, 6);
    const dd = s.slice(6, 8);
    if (!/^[0-9]{4}$/.test(yyyy) || !/^(0[1-9]|1[0-2])$/.test(mm) || !/^(0[1-9]|[12][0-9]|3[01])$/.test(dd)) return undefined;
    return `${yyyy}-${mm}-${dd}`;
  };

  const readExcelFile = (file: File): Promise<ProductData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];
          
          const processedData = jsonData.map((row: ExcelRow) => {
            const paymentRaw = (row["결제일시"] ?? row["결제 일시"] ?? row["결제일"] ?? row["결제시간"] ?? row["결제 시간"]) as string | number | undefined;
            const purchaseRaw = (row["구매일시"] ?? row["구매 일시"]) as string | number | undefined;
            return {
              상품명: String(row["개별상품 명"] || row["상품명"] || "").trim(),
              수량: Number(row["개별상품 개수"] || row["수량"] || 0),
              매출금액: Number(row["결제금액"] || row["매출금액(배송비포함)"] || 0),
              개별금액: Number(row["개별상품 금액"] || row["상품 개별 금액"] || 0),
              구매UID: String((row["구매UID"] ?? row["구매 UID"] ?? row["주문번호"] ?? "")).trim() || undefined,
              결제일시: toDateKey(paymentRaw),
              구매월: toMonthKeyFromPurchase(purchaseRaw),
              구매일: toDayKeyFromPurchase(purchaseRaw),
            } as ProductData;
          }).filter(item => item.상품명 && item.상품명.trim() !== "");
          
          resolve(processedData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const readStockExcelFile = (file: File): Promise<Record<string, { qty?: number; location?: string }>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];

          const map: Record<string, { qty?: number; location?: string }> = {};
          jsonData.forEach((row: ExcelRow) => {
            const nameRaw = (row["상품이름"] ?? row["상품명"] ?? row["제품명"] ?? row["개별상품 명"]) as string | number | undefined;
            const qtyRaw = (row["재고수량"] ?? row["재고 수량"] ?? row["재고"] ?? row["수량"]) as string | number | undefined;
            const locationRaw = (row["상품 매장 진열 위치"] ?? row["매장 진열 위치"] ?? row["진열 위치"] ?? row["진열위치"]) as string | number | undefined;
            const name = String(nameRaw ?? "").trim();
            const qty = Number(qtyRaw ?? 0);
            const location = String(locationRaw ?? "").trim();
            if (name) {
              map[name] = { qty, location: location || undefined };
            }
          });

          resolve(map);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const adjustQuantitiesByUidMismatch = (rows: ProductData[]): { rows: ProductData[]; bagPointAdjustment: number } => {
    const groups: Record<string, ProductData[]> = {};
    rows.forEach((item) => {
      const uid = (item.구매UID || "").toString().trim();
      if (!uid) return;
      if (!groups[uid]) groups[uid] = [];
      groups[uid].push(item);
    });

    let adjustment = 0;
    Object.values(groups).forEach((items) => {
      const sumIndividual = items.reduce((sum, it) => sum + (Number(it.개별금액 || 0) * Number(it.수량 || 0)), 0);
      const groupPaid = items.reduce((paid, it) => {
        const v = Number(it.매출금액 || 0);
        return v > 0 ? paid + v : paid;
      }, 0);

      if (sumIndividual !== groupPaid) {
        items.forEach((it) => {
          if (it.상품명 === "쇼핑백 중") {
            adjustment += 100 * Number(it.수량 || 0);
          } else if (it.상품명 === "쇼핑백 대") {
            adjustment += 200 * Number(it.수량 || 0);
          }
        });
      }
    });

    return { rows, bagPointAdjustment: adjustment };
  };

  const aggregateDataByProduct = (data: ProductData[]): ProductData[] => {
    const aggregated: { [key: string]: ProductData } = {};
    
    data.forEach(item => {
      if (aggregated[item.상품명]) {
        aggregated[item.상품명].수량 += item.수량;
        aggregated[item.상품명].매출금액 += item.매출금액;
      } else {
        aggregated[item.상품명] = { ...item };
      }
    });
    
    return Object.values(aggregated).sort((a, b) => b.매출금액 - a.매출금액);
  };

  const groupProductsBySize = (data: ProductData[]): GroupedProductData[] => {
    const mainProducts: { [key: string]: ProductData } = {};
    const mainProductsByNorm: { [key: string]: ProductData } = {};
    const sizeProductsByNormBase: { [key: string]: ProductData[] } = {};
    const socksSizeItems: ProductData[] = [];

    const normalizeName = (name: string) => name
      .toLowerCase()
      .replace(/[\s_\-\/]/g, '')
      .trim();
    
    data.forEach(item => {
      const isSize = item.상품명.includes('_');
      const isSock = item.상품명.includes('양말');
      if (isSize) {
        if (isSock) {
          // 양말 예외: 나중에 메인명 포함 매칭으로 연결
          socksSizeItems.push(item);
        } else {
          // 일반 규칙: 마지막 '_' 앞의 베이스 이름을 사용하고 정규화하여 매칭
          const lastIdx = item.상품명.lastIndexOf('_');
          const baseRaw = lastIdx > 0 ? item.상품명.slice(0, lastIdx).trim() : item.상품명.trim();
          const baseNorm = normalizeName(baseRaw);
          if (!sizeProductsByNormBase[baseNorm]) {
            sizeProductsByNormBase[baseNorm] = [];
          }
          sizeProductsByNormBase[baseNorm].push(item);
        }
      } else {
        // 메인 상품인 경우
        mainProducts[item.상품명] = item;
        mainProductsByNorm[normalizeName(item.상품명)] = item;
      }
    });
    
    const result: GroupedProductData[] = [];
    
    // 메인 상품들을 매출금액 순으로 정렬
    const sortedMainProducts = Object.values(mainProducts).sort((a, b) => b.매출금액 - a.매출금액);
    
    sortedMainProducts.forEach(mainProduct => {
      const isMainSock = mainProduct.상품명.includes('양말');
      const rawSizeList = isMainSock
        ? socksSizeItems.filter((sp) => sp.상품명.includes(mainProduct.상품명))
        : (sizeProductsByNormBase[normalizeName(mainProduct.상품명)] || []);
      // 메인 상품의 개별 금액으로 사이즈 상품 매출 재계산 후 수량 순 정렬
      const calculatedSizeProducts = rawSizeList
        .map((sizeProduct) => ({
          ...sizeProduct,
          매출금액: (mainProduct.개별금액 || 0) * sizeProduct.수량
        }))
        .sort((a, b) => b.수량 - a.수량);
      
      // 쇼핑백 상품들의 개별 금액 설정
      let individualPrice = mainProduct.개별금액 || 0;
      if (mainProduct.상품명 === "쇼핑백 중") {
        individualPrice = 100;
      } else if (mainProduct.상품명 === "쇼핑백 대") {
        individualPrice = 200;
      }
      
      // 메인 상품의 총 매출을 다시 계산
      let recalculatedMainProduct;
      if (mainProduct.상품명 === "쇼핑백 중" || mainProduct.상품명 === "쇼핑백 대") {
        // 쇼핑백 상품은 개별 금액 * 수량으로 계산
        recalculatedMainProduct = {
          ...mainProduct,
          매출금액: individualPrice * mainProduct.수량
        };
      } else {
        // 다른 메인 상품은 사이즈 상품들의 매출 합계
        const totalSizeRevenue = calculatedSizeProducts.reduce((sum, sizeProduct) => sum + sizeProduct.매출금액, 0);
        recalculatedMainProduct = {
          ...mainProduct,
          매출금액: totalSizeRevenue
        };
      }
      
      result.push({
        mainProduct: recalculatedMainProduct,
        sizeProducts: calculatedSizeProducts
      });
    });
    
    return result;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const totalSaleAmount = groupedData.reduce((sum, group) => sum + group.mainProduct.매출금액, 0);
  const pointUsageAmount = totalSaleAmount - totalPaidAmount + bagPointAdjustment;

  const handleStockFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (groupedData.length === 0) {
      alert("먼저 매출 엑셀 파일을 업로드 해주세요.");
      event.currentTarget.value = "";
      return;
    }
    setIsLoading(true);
    try {
      const map = await readStockExcelFile(file);
      setStockByName(map);
      setStockLoadedCount(Object.keys(map).length);
    } catch (error) {
      console.error("재고 파일 처리 중 오류가 발생했습니다:", error);
      alert("재고 파일 처리 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDayChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedDay(value);
    const rowsInScope = value === 'ALL' ? allRows : allRows.filter((r) => r.구매일 === value);
    recomputeForScope(rowsInScope);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📊 무인매장 매출 엑셀 변환
          </h1>
          <p className="text-lg text-gray-600">
            일일 매출 엑셀 파일을 업로드 하세요.
          </p>
        </div>

        {/* 파일 업로드 섹션 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="mt-4">
                <label htmlFor="file-upload" className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
                  엑셀 파일 선택
                </label>
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="sr-only"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                .xlsx 또는 .xls 파일만 지원됩니다
              </p>
              <p className="text-xs text-gray-400 mt-1">
                매출현황 -{'>'}  매출내역 -{'>'} 엑셀다운로드(정산자료)의 파일을 업로드 해주세요.
              </p>

              {/* 월 선택 UI는 제거, 일자 선택은 타이틀 우측으로 이동 */}

              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3">재고 수량 파일 업로드 (매출 파일 업로드 후)</p>
                <label
                  htmlFor="stock-file-upload"
                  className={`cursor-pointer ${groupedData.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-medium py-2 px-4 rounded-md transition-colors`}
                >
                  재고 엑셀 선택
                </label>
                <input
                  id="stock-file-upload"
                  name="stock-file-upload"
                  type="file"
                  className="sr-only"
                  accept=".xlsx,.xls"
                  onChange={handleStockFileUpload}
                  disabled={groupedData.length === 0}
                />
                {stockLoadedCount > 0 && (
                  <p className="mt-2 text-xs text-gray-500">불러온 재고 품목: {stockLoadedCount}개</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="text-center py-8">
            <div className="inline-flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              파일을 처리하고 있습니다...
            </div>
          </div>
        )}

        {/* 결과 표시 */}
        {groupedData.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                상품별 매출 ({groupedData.length}개 상품)
              </h2>
              {availableDays.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="day-filter" className="text-sm text-gray-600">구매일 선택:</label>
                  <select
                    id="day-filter"
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={selectedDay}
                    onChange={handleDayChange}
                  >
                    <option value="ALL">전체</option>
                    {availableDays.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      순위
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상품명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     품목코드
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     품번
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      판매 수량
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      재고 수량
                    </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    진열 위치
                  </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      판매 금액
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedData.map((group, index) => (
                    <React.Fragment key={group.mainProduct.상품명}>
                      {/* 메인 상품 행 */}
                      <tr className="hover:bg-gray-50 bg-blue-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {group.mainProduct.상품명}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {productRefsByName[group.mainProduct.상품명]?.품목코드 ?? '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {productRefsByName[group.mainProduct.상품명]?.품번 ?? '-'}
                        </td>
                       
                        
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 ">
                          {group.mainProduct.수량.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 ">
                          {adjustedStockByName[group.mainProduct.상품명]?.qty !== undefined ? `${adjustedStockByName[group.mainProduct.상품명]?.qty?.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {stockByName[group.mainProduct.상품명]?.location ?? '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                          ₩{formatCurrency(group.mainProduct.매출금액)}
                        </td>
                      </tr>
                      {/* 사이즈 상품들 */}
                      {group.sizeProducts.map((sizeProduct, sizeIndex) => (
                        <tr key={`${group.mainProduct.상품명}-${sizeIndex}`} className="hover:bg-gray-50">
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-400">
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600 pl-8">
                            - {sizeProduct.상품명}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                          {productRefsByName[sizeProduct.상품명]?.품목코드 ?? '-'}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                          {productRefsByName[sizeProduct.상품명]?.품번 ?? productRefsByName[group.mainProduct.상품명]?.품번 ?? '-'}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                            {sizeProduct.수량}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                            {adjustedStockByName[sizeProduct.상품명]?.qty !== undefined ? `${adjustedStockByName[sizeProduct.상품명]?.qty?.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                            {stockByName[sizeProduct.상품명]?.location ?? '-'}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-600">
                            ₩{formatCurrency(sizeProduct.매출금액)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* 요약 정보 */}
            <div className="bg-gray-50 px-6 py-8">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-md">
                <div>
                  <span className="text-gray-500 ">총 상품 수:</span>
                  <span className="ml-2 font-semibold ">{groupedData.length}개</span>
                </div>
                <div>
                  <span className="text-gray-500 ">총 수량:</span>
                  <span className="ml-2 font-semibold ">
                    {groupedData.reduce((sum, group) => sum + group.mainProduct.수량, 0).toLocaleString()}개
                  </span>
                </div>
                {/* <div>
                  <span className="text-gray-500  ">판매 금액:</span>
                  <span className="ml-2 font-semibold ">₩{formatCurrency(totalSaleAmount)}</span>
                </div> */}
                 <div>
                  <span className="text-gray-500 ">매출금액:</span>
                  <span className="ml-2 font-semibold text-green-600 ">₩{formatCurrency(totalPaidAmount+pointUsageAmount)}</span>
                </div>
                <div>
                  <span className="text-gray-500 ">포인트 사용 금액:</span>
                  <span className="ml-2 font-semibold  text-blue-600 ">₩{formatCurrency(pointUsageAmount)}</span>
                </div>
                <div>
                  <span className="text-gray-500 ">실제 매출:</span>
                  <span className="ml-2 font-semibold text-red-600 ">₩{formatCurrency(totalPaidAmount)}</span>
                </div>
                
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
