-- 상품정보 테이블 생성
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

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX idx_product_info_code ON product_info(code);
CREATE INDEX idx_product_info_product_number ON product_info(product_number);
CREATE INDEX idx_product_info_type ON product_info(type);
CREATE INDEX idx_product_info_mbti ON product_info(mbti);
CREATE INDEX idx_product_info_gender ON product_info(gender);

-- RLS (Row Level Security) 설정
ALTER TABLE product_info ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기/쓰기 가능하도록 정책 설정
CREATE POLICY "Enable read access for all users" ON product_info FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON product_info FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON product_info FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON product_info FOR DELETE USING (true);

-- 샘플 데이터 삽입 (선택사항)
INSERT INTO product_info (name, code, product_number, type, price, mbti, gender, rfid, qr) VALUES
('기본 티셔츠', 'TS001', 'TS001-BLK-M', '의류', 25000, 'INTJ', '남성', 'RFID001', 'QR001'),
('데님 팬츠', 'DP001', 'DP001-BLU-32', '의류', 45000, 'ENFP', '여성', 'RFID002', 'QR002'),
('스니커즈', 'SN001', 'SN001-WHT-42', '신발', 89000, 'ISTP', '공통', 'RFID003', 'QR003'),
('백팩', 'BP001', 'BP001-BLK-ONE', '가방', 65000, 'ESTJ', '공통', 'RFID004', 'QR004'),
('캡 모자', 'CP001', 'CP001-RED-ONE', '액세서리', 15000, 'INFP', '공통', 'RFID005', 'QR005'); 