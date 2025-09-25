# MediClear

> 환자 눈높이로 의료 설명을 자동 변환하는 **웹앱(PWA 지원)**.  
> 의료진 메모(진단/수술/복약)를 환자가 **쉽게 이해하고 바로 행동**할 수 있는 문장으로 바꿉니다.

![Node](https://img.shields.io/badge/Node.js-%E2%89%A518.x-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-js-black)
![PWA](https://img.shields.io/badge/PWA-yes-5A0FC8)

---

## ✨ 핵심 포인트
- **순수 웹앱 + PWA**: 브라우저에서 실행(설치형 앱 아님), 홈화면 추가/오프라인 캐시 지원  
- **즉시 실행**: `.env`에 **`OPENAI_API_KEY` 하나만** 있으면 동작  
- **간결한 구조**: `server.js`(Express) + 정적 웹(`index.html`, `app.js`, `style.css` …)

---

## 🚀 빠른 시작 

1) 저장소 클론 & 의존성 설치  
```bash
git clone https://github.com/Lova-clover/MediClear.git
cd MediClear
npm install
```

2) 환경변수 설정 (`.env`)  
```ini
OPENAI_API_KEY=sk-xxxxxxx_your_key

# (선택) 모델/포트 지정
# MODEL=gpt-4o-mini
# PORT=3000
```

3) 실행  
```bash
npm start    # 또는: node server.js
```

4) 접속  
브라우저에서 `http://localhost:<PORT>` (기본 3000 또는 .env의 PORT)

---

## 🗂️ 폴더 구조
```
MediClear/
├─ routes/                           # Express 라우팅
├─ app.js                            # 클라이언트 JS
├─ server.js                         # Express 서버 엔트리
├─ index.html                        # 메인
├─ doctor.html / surgery.html        # 도메인 화면
├─ login.html / register.html / mypage.html
├─ style.css
├─ manifest.json / service-worker.js # PWA
├─ instructions.json                 # (데모) 지침 템플릿
├─ package.json / package-lock.json
└─ assets/                           # 발표자료/데모영상 
   ├─ MediClear.pptx
   └─ demo.mp4
```

---

## 📱 웹앱(PWA) 안내
- 주소창에 **설치 아이콘**이 보이면 홈화면 추가 가능  
- 오프라인 캐시는 `service-worker.js`로 관리 (업데이트 시 캐시 버전만 올리면 됨)

---

## 🔌 OpenAI 연동
- 서버는 환경변수 **`OPENAI_API_KEY`**만 있으면 LLM 호출 준비 완료  
- 추가 설정 없이 **키만 넣으면 동작**  
- (선택) `MODEL`로 모델 변경 가능

---

## 📎 발표자료 / 데모 영상 첨부
리포에 직접 포함하려면 `assets/` 폴더를 만들고 파일을 넣은 뒤, 아래처럼 README에서 참조하세요.

- 발표자료(PPT): [MediClear.pptx](assets/MediClear.pptx)
- 데모 영상(MP4): [demo.mp4](assets/demo.mp4)

---

## 🔒 프로덕션 전 점검
- **HTTPS**, **입력 검증**, **인증/인가(RBAC)**, **비밀번호 해시/솔트**, **로그/감사**,  **민감정보 최소 수집·암호화** 등 보안 항목을 반드시 강화하세요.  
- `instructions.json` 등 샘플은 **데모용**입니다.

---

## 🏗️ 간단 아키텍처
```
[Client: HTML/CSS/JS + PWA]
  ├─ UI 렌더링 (index/doctor/surgery/login/register/mypage.html)
  ├─ PWA (manifest.json, service-worker.js)
  └─ fetch() → /api/*

[Server: Node.js + Express]
  ├─ server.js (정적 제공/미들웨어/에러 처리)
  └─ routes/ (엔드포인트)

[LLM]
  └─ OPENAI_API_KEY 로 서버에서 직접 호출
```
---

## 📌 대회 
- K-Intelligence 2025 Track 2 참가  
- 성과: 예선 3등, 본선 9등  
- 후기/정리: <[lova-clover](https://velog.io/@lova-clover/K-intelligence-%ED%95%B4%EC%BB%A4%ED%86%A4-2025-Track-2-GPT-4o-%EA%B8%B0%EB%B0%98-Custom-%EB%AA%A8%EB%8D%B8beta-%EC%98%88%EC%84%A0-%EB%B3%B8%EC%84%A0-%EC%B0%B8%EA%B0%80-%ED%9B%84%EA%B8%B0)>  

