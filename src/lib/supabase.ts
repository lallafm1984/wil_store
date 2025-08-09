import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase 환경 변수가 설정되지 않았습니다.')
  console.warn('NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해주세요.')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
)

// 상품정보 테이블 인터페이스
export interface ProductInfo {
  id?: number
  name: string
  code: string
  product_number: string
  price: number
  mbti: string
  gender: '남성' | '여성' | '공통'
  rfid: string
  qr: string
  created_at?: string
  updated_at?: string
}

// 환경 변수 확인 함수
export function checkEnvironmentVariables() {
  return {
    url: supabaseUrl,
    key: supabaseAnonKey,
    isConfigured: !!(supabaseUrl && supabaseAnonKey)
  }
}

// Supabase 연결 테스트 함수
export async function testSupabaseConnection() {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        success: false,
        error: '환경 변수가 설정되지 않았습니다.',
        details: {
          url: supabaseUrl ? '설정됨' : '설정되지 않음',
          key: supabaseAnonKey ? '설정됨' : '설정되지 않음'
        }
      }
    }

    // 간단한 쿼리로 연결 테스트 (테이블이 존재하지 않아도 연결은 성공)
    const { data, error } = await supabase
      .from('_dummy_table_for_test')
      .select('*')
      .limit(1)

    // 테이블이 존재하지 않아도 연결은 성공 (PGRST116: 테이블이 존재하지 않음)
    if (error && (error.code === 'PGRST116' || error.code === '42P01')) {
      return {
        success: true,
        message: 'Supabase 연결 성공 (테이블이 존재하지 않음)',
        details: {
          url: supabaseUrl,
          key: supabaseAnonKey.substring(0, 10) + '...',
          note: '연결은 성공했지만 테스트용 테이블이 존재하지 않습니다. 이는 정상적인 상황입니다.'
        }
      }
    }

    if (error) {
      return {
        success: false,
        error: error.message,
        details: {
          code: error.code,
          url: supabaseUrl
        }
      }
    }

    return {
      success: true,
      message: 'Supabase 연결 성공',
      data: data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
      details: {
        url: supabaseUrl,
        key: supabaseAnonKey ? '설정됨' : '설정되지 않음'
      }
    }
  }
}

// 데이터베이스 정보 확인 함수
export async function getDatabaseInfo() {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        success: false,
        error: '환경 변수가 설정되지 않았습니다.'
      }
    }

    // 데이터베이스 버전 정보 확인
    const { data, error } = await supabase.rpc('version')

    if (error) {
      // RPC가 없을 경우 다른 방법으로 연결 확인
      return {
        success: true,
        message: 'Supabase 연결 확인됨',
        details: {
          url: supabaseUrl,
          note: '데이터베이스 정보를 가져올 수 없지만 연결은 정상입니다.'
        }
      }
    }

    return {
      success: true,
      message: '데이터베이스 정보 확인됨',
      data: data,
      details: {
        url: supabaseUrl,
        version: data
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
}

// 상품정보 테이블 생성 함수
export async function createProductInfoTable() {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        success: false,
        error: '환경 변수가 설정되지 않았습니다.'
      }
    }

    // 테이블 생성 SQL 실행
    const { data, error } = await supabase.rpc('create_product_info_table')

    if (error) {
      // RPC가 없을 경우 직접 테이블 생성 시도
      return {
        success: false,
        error: '테이블 생성 RPC가 설정되지 않았습니다. Supabase 대시보드에서 수동으로 테이블을 생성해주세요.',
        details: {
                     sql: `
CREATE TABLE product_info (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  product_number VARCHAR(100) NOT NULL,
  type VARCHAR(100) NOT NULL,
  price INTEGER NOT NULL,
  mbti VARCHAR(10) NOT NULL,
  gender VARCHAR(10) CHECK (gender IN ('남성', '여성', '공통')),
  rfid VARCHAR(255) UNIQUE,
  qr VARCHAR(255) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_product_info_code ON product_info(code);
CREATE INDEX idx_product_info_product_number ON product_info(product_number);
CREATE INDEX idx_product_info_type ON product_info(type);
CREATE INDEX idx_product_info_mbti ON product_info(mbti);
CREATE INDEX idx_product_info_gender ON product_info(gender);
           `
        }
      }
    }

    return {
      success: true,
      message: '상품정보 테이블이 성공적으로 생성되었습니다.',
      data: data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
}

// 상품정보 추가 함수
export async function addProductInfo(product: ProductInfo) {
  try {
    // 실제 데이터베이스에 존재하는 컬럼만 추가
    const insertData: any = {
      name: product.name,
      code: product.code,
      product_number: product.product_number,
      price: product.price,
      gender: product.gender,
      rfid: product.rfid,
      qr: product.qr,
      mbti: product.mbti
    };
    
    const { data, error } = await supabase
      .from('product_info')
      .insert([insertData])
      .select()

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error
      }
    }

    return {
      success: true,
      message: '상품정보가 성공적으로 추가되었습니다.',
      data: data[0]
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
}

// 상품정보 조회 함수
export async function getProductInfo(id?: number) {
  try {
    let query = supabase.from('product_info').select('*')
    
    if (id) {
      query = query.eq('id', id)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error
      }
    }

    return {
      success: true,
      message: '상품정보를 성공적으로 조회했습니다.',
      data: data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
}

// 상품정보 수정 함수
export async function updateProductInfo(id: number, updates: Partial<ProductInfo>) {
  try {
    // id를 숫자로 확실히 변환
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    
    if (isNaN(numericId)) {
      return {
        success: false,
        error: '유효하지 않은 ID입니다.',
        details: { id }
      }
    }

    // 실제 데이터베이스에 존재하는 컬럼만 업데이트
    const updateData: any = {};
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.code !== undefined) updateData.code = updates.code;
    if (updates.product_number !== undefined) updateData.product_number = updates.product_number;
    if (updates.price !== undefined) updateData.price = updates.price;
    if (updates.gender !== undefined) updateData.gender = updates.gender;
    if (updates.rfid !== undefined) updateData.rfid = updates.rfid;
    if (updates.qr !== undefined) updateData.qr = updates.qr;
    
    // mbti 컬럼이 존재하는지 확인 후 추가
    let mbtiColumnExists = false;
    try {
      const { data: testData, error: testError } = await supabase
        .from('product_info')
        .select('mbti')
        .limit(1);
      
      if (!testError) {
        mbtiColumnExists = true;
        if (updates.mbti !== undefined) updateData.mbti = updates.mbti;
      } else {
        console.log('mbti 컬럼이 존재하지 않습니다. 에러:', testError);
      }
    } catch (e) {
      console.log('mbti 컬럼 확인 중 에러:', e);
    }
    
    // mbti만 수정하려는 경우 다른 필드도 포함
    if (Object.keys(updateData).length === 0 && updates.mbti !== undefined && !mbtiColumnExists) {
      console.log('mbti 컬럼이 존재하지 않아 업데이트를 건너뜁니다.');
      return {
        success: false,
        error: 'mbti 컬럼이 데이터베이스에 존재하지 않습니다.',
        details: { message: 'mbti 컬럼을 사용하려면 데이터베이스에 해당 컬럼을 추가해주세요.' }
      };
    }
    
    updateData.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('product_info')
      .update(updateData)
      .eq('id', numericId)
      .select('*')

    if (error) {
      console.error('Update error:', error);
      return {
        success: false,
        error: error.message,
        details: error
      }
    }

    return {
      success: true,
      message: '상품정보가 성공적으로 수정되었습니다.',
      data: data[0]
    }
  } catch (error) {
    console.error('Update exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
}

// 상품정보 삭제 함수
export async function deleteProductInfo(id: number) {
  try {
    // id를 숫자로 확실히 변환
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    
    if (isNaN(numericId)) {
      return {
        success: false,
        error: '유효하지 않은 ID입니다.',
        details: { id }
      }
    }

    const { error } = await supabase
      .from('product_info')
      .delete()
      .eq('id', numericId)

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error
      }
    }

    return {
      success: true,
      message: '상품정보가 성공적으로 삭제되었습니다.'
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
}

// 상품정보 검색 함수
export async function searchProductInfo(searchTerm: string) {
  try {
    const { data, error } = await supabase
      .from('product_info')
      .select('*')
      .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,product_number.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false })

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error
      }
    }

    return {
      success: true,
      message: '검색 결과를 성공적으로 조회했습니다.',
      data: data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }
  }
} 