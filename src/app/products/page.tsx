"use client";

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  ProductInfo, 
  addProductInfo, 
  getProductInfo, 
  updateProductInfo, 
  deleteProductInfo, 
  searchProductInfo
} from '@/lib/supabase';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: ProductInfo | null;
  onSubmit: (product: Omit<ProductInfo, 'id' | 'created_at' | 'updated_at'>) => void;
  loading: boolean;
}

function ProductModal({ isOpen, onClose, product, onSubmit, loading }: ModalProps) {
  const [formData, setFormData] = useState<Omit<ProductInfo, 'id' | 'created_at' | 'updated_at'>>({
    name: '',
    code: '',
    product_number: '',
    price: 0,
    mbti: '',
    gender: '공통',
    rfid: '',
    qr: ''
  });

  // 모달이 열릴 때 폼 데이터 초기화
  useEffect(() => {
    if (isOpen) {
      if (product) {
        // 수정 모드 - undefined 값들을 빈 문자열로 처리
        setFormData({
          name: product.name || '',
          code: product.code || '',
          product_number: product.product_number || '',
          price: product.price || 0,
          mbti: product.mbti || '',
          gender: product.gender || '공통',
          rfid: product.rfid || '',
          qr: product.qr || ''
        });
      } else {
        // 추가 모드
        setFormData({
          name: '',
          code: '',
          product_number: '',
          price: 0,
          mbti: '',
          gender: '공통',
          rfid: '',
          qr: ''
        });
      }
    }
  }, [isOpen, product]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) {
      alert('필수 필드를 입력해주세요.');
      return;
    }
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0  flex items-center justify-center z-50 backdrop-blur-sm"
      
    >
      <div 
        className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            {product ? '상품 수정' : '상품 추가'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">코드 *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">품번 *</label>
              <input
                type="text"
                value={formData.product_number}
                onChange={(e) => setFormData({ ...formData, product_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">가격</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MBTI</label>
              <input
                type="text"
                value={formData.mbti}
                onChange={(e) => setFormData({ ...formData, mbti: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">성별</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as '남성' | '여성' | '공통' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="공통">공통</option>
                <option value="남성">남성</option>
                <option value="여성">여성</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RFID</label>
              <input
                type="text"
                value={formData.rfid}
                onChange={(e) => setFormData({ ...formData, rfid: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">QR</label>
              <input
                type="text"
                value={formData.qr}
                onChange={(e) => setFormData({ ...formData, qr: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '처리 중...' : (product ? '수정' : '추가')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // 상품정보 목록 로드
  const loadProducts = async () => {
    setLoading(true);
    try {
      const result = await getProductInfo();
      if (result.success) {
        setProducts(result.data || []);
      } else {
        setMessage({ type: 'error', text: result.error || '상품정보를 불러오는데 실패했습니다.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '상품정보를 불러오는데 실패했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // 상품정보 추가
  const handleAddProduct = async (formData: Omit<ProductInfo, 'id' | 'created_at' | 'updated_at'>) => {
    setLoading(true);
    try {
      const result = await addProductInfo(formData);
      if (result.success) {
        setMessage({ type: 'success', text: result.message || '상품정보가 추가되었습니다.' });
        setModalOpen(false);
        loadProducts();
      } else {
        setMessage({ type: 'error', text: result.error || '상품정보 추가에 실패했습니다.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '상품정보 추가에 실패했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // 상품정보 수정
  const handleUpdateProduct = async (formData: Omit<ProductInfo, 'id' | 'created_at' | 'updated_at'>) => {
    if (!editingProduct?.id) return;

    setLoading(true);
    try {
      const result = await updateProductInfo(editingProduct.id, formData);
      if (result.success) {
        setMessage({ type: 'success', text: result.message || '상품정보가 수정되었습니다.' });
        setModalOpen(false);
        setEditingProduct(null);
        loadProducts();
      } else {
        setMessage({ type: 'error', text: result.error || '상품정보 수정에 실패했습니다.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '상품정보 수정에 실패했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // 상품정보 삭제
  const handleDeleteProduct = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    setLoading(true);
    try {
      const result = await deleteProductInfo(id);
      if (result.success) {
        setMessage({ type: 'success', text: result.message || '상품정보가 삭제되었습니다.' });
        loadProducts();
      } else {
        setMessage({ type: 'error', text: result.error || '상품정보 삭제에 실패했습니다.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '상품정보 삭제에 실패했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // 상품정보 검색
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      loadProducts();
      return;
    }

    setLoading(true);
    try {
      const result = await searchProductInfo(searchTerm);
      if (result.success) {
        setProducts(result.data || []);
      } else {
        setMessage({ type: 'error', text: result.error || '검색에 실패했습니다.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '검색에 실패했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  // 모달 열기 (추가)
  const openAddModal = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  // 모달 열기 (수정)
  const openEditModal = (product: ProductInfo) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  // 모달 닫기
  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
  };

  // 폼 제출 처리
  const handleSubmit = (formData: Omit<ProductInfo, 'id' | 'created_at' | 'updated_at'>) => {
    if (editingProduct) {
      handleUpdateProduct(formData);
    } else {
      handleAddProduct(formData);
    }
  };

  // 엑셀 파일 업로드 처리
  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await readExcelFile(file);
      const processedData = processExcelData(data);
      await uploadToDatabase(processedData);
      setMessage({ type: 'success', text: '엑셀 파일 업로드가 완료되었습니다.' });
      loadProducts();
    } catch (error) {
      setMessage({ type: 'error', text: `엑셀 파일 업로드 실패: ${error}` });
    } finally {
      setUploading(false);
      event.target.value = ''; // 파일 입력 초기화
    }
  };

  // 엑셀 파일 읽기
  const readExcelFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // 엑셀 데이터 처리
  const processExcelData = (data: any[]): ProductInfo[] => {
    // "_"가 포함된 상품들만 필터링
    const underscoreProducts = data.filter((row: any) => 
      row['상품이름'] && row['상품이름'].includes('_')
    );

    // "_"가 포함되지 않는 상품들
    const normalProducts = data.filter((row: any) => 
      row['상품이름'] && !row['상품이름'].includes('_')
    );

    return underscoreProducts.map((underscoreRow: any) => {
      // "_"가 포함되지 않는 상품 중에서 해당 상품이름이 완전히 포함되는 상품 찾기
      const matchingNormal = normalProducts.find((normalRow: any) => 
        normalRow['상품이름'] && underscoreRow['상품이름'] && 
        normalRow['상품이름'].includes(underscoreRow['상품이름'])
      );

      return {
        name: underscoreRow['상품이름'] || '',
        code: underscoreRow['상품코드'] || '',
        product_number: underscoreRow['품번'] || '',
        price: matchingNormal ? (matchingNormal['상품가격'] || 0) : (underscoreRow['상품가격'] || 0),
        mbti: '',
        gender: matchingNormal ? (matchingNormal['상품 MBTI 성별'] || '공통') : (underscoreRow['상품 MBTI 성별'] || '공통'),
        rfid: matchingNormal ? (matchingNormal['상품 RFID'] || '') : (underscoreRow['상품 RFID'] || ''),
        qr: matchingNormal ? (matchingNormal['상품 QR'] || '') : (underscoreRow['상품 QR'] || '')
      };
    });
  };

  // 데이터베이스에 업로드
  const uploadToDatabase = async (products: ProductInfo[]) => {
    let successCount = 0;
    let updateCount = 0;

    for (const product of products) {
      try {
        // 기존 상품 코드로 검색
        const existingResult = await searchProductInfo(product.code);
        
        if (existingResult.success && existingResult.data && existingResult.data.length > 0) {
          // 기존 상품이 있으면 업데이트
          const existingProduct = existingResult.data[0];
          const updateResult = await updateProductInfo(existingProduct.id!, product);
          if (updateResult.success) {
            updateCount++;
          }
        } else {
          // 새 상품 추가
          const addResult = await addProductInfo(product);
          if (addResult.success) {
            successCount++;
          }
        }
      } catch (error) {
        console.error('상품 처리 중 오류:', error);
      }
    }

    if (successCount > 0 || updateCount > 0) {
      setMessage({ 
        type: 'success', 
        text: `엑셀 업로드 완료: ${successCount}개 추가, ${updateCount}개 업데이트` 
      });
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">상품정보 관리</h1>
          <div className="flex space-x-4">
            <button
              onClick={openAddModal}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              상품 추가
            </button>
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                disabled={uploading}
                className="hidden"
                id="excel-upload"
              />
              <label
                htmlFor="excel-upload"
                className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploading ? '업로드 중...' : '엑셀 업로드'}
              </label>
            </div>
          </div>
        </div>

        {/* 메시지 표시 */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
              {message.text}
            </p>
          </div>
        )}

                 {/* 엑셀 업로드 안내 */}
         <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
           <h3 className="text-sm font-medium text-blue-800 mb-2">엑셀 파일 업로드 안내</h3>
           <ul className="text-xs text-blue-700 space-y-1">
             <li>• 엑셀 파일에는 "product_name", "product_code", "product_number", "product_price", "product_mbti_gender", "product_rfid", "product_qr" 컬럼이 필요합니다.</li>
             <li>• "product_name"에 "_"가 포함된 상품만 처리됩니다.</li>
             <li>• 가격, 성별, RFID, QR 정보는 "_"가 포함되지 않는 상품에서 매칭되는 정보를 가져옵니다.</li>
             <li>• 상품코드가 중복되는 경우 기존 데이터를 업데이트합니다.</li>
           </ul>
         </div>

        {/* 검색 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder="상품명, 코드, 품번으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              검색
            </button>
            <button
              onClick={() => {
                setSearchTerm('');
                loadProducts();
              }}
              disabled={loading}
              className="px-6 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50"
            >
              초기화
            </button>
          </div>
        </div>

        {/* 상품 목록 */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              상품 목록 ({products.length}개)
            </h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                로딩 중...
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              상품이 없습니다. 상품을 추가해주세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">코드</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">품번</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가격</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MBTI</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">성별</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.product_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₩{product.price.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.mbti}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.gender}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openEditModal(product)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id!)}
                            className="text-red-600 hover:text-red-900"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 상품 추가/수정 모달 */}
        <ProductModal
          isOpen={modalOpen}
          onClose={closeModal}
          product={editingProduct}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>
    </div>
  );
} 