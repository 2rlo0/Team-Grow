// frontend/src/components/Chatbot.tsx 이거야
'use client';

import { API_BASE } from '@/lib/env';
import * as React from 'react';
// 맨 위 import들 사이에 추가
import DashboardHeader from './dashboard/DashboardHeader';
import DashboardBottomNav from './dashboard/DashboardBottomNav';
import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  User,
  Camera,
  Sparkles,
  Menu,
  X,
  LayoutDashboard,
  Settings as SettingsIcon,
  MessageSquare,
  UserCircle,
  Bookmark,
  BookmarkCheck,
  Bell,
  AlertTriangle,
} from 'lucide-react';
import { useUserStore } from '@/stores/auth/store';
import {
  chatStream,
  fetchRecommendations,
  RecProduct,
  uploadOcrImage,
  IngredientInfo,
  fetchIngredientDetail,
} from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  SS_KEY,
  MAX_KEEP,
  PersistMsg,
  MessageLike,
  loadSession,
  toPersist,
  createSessionSaver,
} from '@/lib/chatSession';

export interface ChatInterfaceProps {
  userName?: string;
  onNavigate?: (page: string) => void;
}

interface Message {
  id: number;
  type: 'user' | 'ai';
  content: string;
  image?: string;
  timestamp: Date;
  productInfo?: {
    name: string;
    ingredients: string[];
    description: string;
  };
  products?: RecProduct[];
  analysis?: any;
  ocrImageUrl?: string | null;
}

/** caution 등급 정렬/표시용 타입 */
type Grade = '위험' | '주의' | '안전' | null | undefined;

/** caution 등급 뱃지 스타일 (모달 헤더용) */
function gradeStyle(grade: Grade) {
  if (grade === '위험') return { label: '위험', cls: 'bg-red-50 text-red-700 border-red-200' };
  if (grade === '주의')
    return { label: '주의', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (grade === '안전')
    return { label: '안전', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  return { label: '정보 없음', cls: 'bg-gray-50 text-gray-600 border-gray-200' };
}

/** caution 등급 텍스트 색상 (성분 칩용) */
function gradeTextClass(grade: Grade) {
  if (grade === '위험') return 'text-red-600';
  if (grade === '주의') return 'text-amber-600';
  if (grade === '안전') return 'text-emerald-600';
  return 'text-gray-700';
}

/** 내부 키(정보없음)로 정규화 */
const gradeKey = (g: Grade): '안전' | '주의' | '위험' | '정보없음' =>
  g === '안전' ? '안전' : g === '주의' ? '주의' : g === '위험' ? '위험' : '정보없음';

/** 표시 라벨("정보 없음") 변환 */
const gradeLabel = (k: '안전' | '주의' | '위험' | '정보없음') =>
  k === '정보없음' ? '정보 없음' : k;

/** 섹션 표시 순서: 안전 → 주의 → 위험 → 정보 없음 */
const GRADE_ORDER: Array<'안전' | '주의' | '위험' | '정보없음'> = [
  '안전',
  '주의',
  '위험',
  '정보없음',
];

// caution_grade → severity 매핑 (profile 페이지와 동일 로직)
function mapSeverityFromGrade(grade: string | null | undefined): 'low' | 'mid' | 'high' | null {
  if (!grade) return null;
  if (grade.includes('고')) return 'high';
  if (grade.includes('중')) return 'mid';
  return 'low';
}

/** 간단 아코디언 */
function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg p-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center text-left"
      >
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && <div className="mt-2 pl-1 pr-1 pb-1 transition-all">{children}</div>}
    </div>
  );
}

/** 챗봇 도움말 모달 */
function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="help-backdrop"
        className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="help-panel"
        className="fixed inset-0 z-[121] flex items-center justify-center p-4"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        aria-modal="true"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800">AI 상담 도움말</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="도움말 닫기"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 내용 */}
          <div className="px-5 py-4 space-y-4 text-sm text-gray-700">
            {/* 1. 기능 안내 */}
            <section>
              <h4 className="font-semibold text-gray-800 mb-1">이 챗봇은 무엇을 할 수 있나요?</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  피부 타입·가격·선호 성분에 맞는 <b>맞춤 화장품 추천</b>
                </li>
                <li>
                  제품 <b>성분 분석</b> 및 위험/주의 성분 안내
                </li>
                <li>
                  세안·보습·선크림 등 <b>기본 스킨케어 루틴 가이드</b>
                </li>
                <li>
                  제품 사진을 올리면 <b>OCR로 분석한 요약 설명</b>
                </li>
              </ul>
            </section>

            {/* 2. 추천 질문 예시 */}
            <Accordion title="추천 질문 예시" defaultOpen={false}>
              <div className="space-y-2 mt-2 text-[13px]">
                <p className="text-gray-500 font-medium">제품 추천</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>“건성피부가 쓰기 좋은 3만원 이하 촉촉한 수분크림 추천해줘”</li>
                  <li>“레티놀이 들어간 제품 추천해줘”</li>
                  <li>“지성 피부용 쿠션 추천해줘”</li>
                </ul>

                <p className="text-gray-500 font-medium mt-2">성분/주의 성분</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>“나이아신아마이드 성분 설명해줘”</li>
                  <li>“향료·알코올·파라벤 같은 성분이 뭐야?”</li>
                  <li>“민감성 피부가 피해야 할 성분 알려줘”</li>
                </ul>

                <p className="text-gray-500 font-medium mt-2">이미지 분석</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>사진을 업로드하면 자동으로 성분을 분석해드려요.</li>
                </ul>
              </div>
            </Accordion>

            {/* 3. 사용 팁 */}
            <Accordion title="사용 팁" defaultOpen={false}>
              <ul className="list-disc list-inside space-y-1 mt-2 text-[13px]">
                <li>
                  <b>브랜드·가격대·카테고리</b>(선크림, 크림 등)을 함께 적으면 더 정확해요.
                </li>
                <li>“성분 이름 + 궁금한 점” 형태로 물어보면 설명을 더 자세히 들을 수 있어요.</li>
                <li>
                  추천 카드에서 <b>“리뷰 요약 보기 / 성분 보기”</b> 버튼으로 상세 내용을 확인할 수
                  있어요.
                </li>
              </ul>
            </Accordion>
          </div>

          {/* 푸터 */}
          <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:opacity-90 text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** 성분 상세 모달 UI (선호/주의 저장 포함) */
function IngredientModal({
  open,
  onClose,
  targetName,
  loading,
  error,
  detail,
}: {
  open: boolean;
  onClose: () => void;
  targetName: string | null;
  loading: boolean;
  error: string | null;
  detail: IngredientInfo | null;
}) {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('user_id') : null;
  const storeName = useUserStore(state => state.name);
  const [isPreferred, setIsPreferred] = useState(false);
  const [isCaution, setIsCaution] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [ingredientId, setIngredientId] = useState<number | null>(null);

  // 성분 선호/주의 상태 확인
  useEffect(() => {
    if (!open || !targetName || !userId) return;

    const checkIngredientStatus = async () => {
      try {
        // 수정 1: 백엔드 API_BASE 사용
        const res = await fetch(`${API_BASE}/user-ingredients?userId=${userId}`);
        if (!res.ok) return;

        const data = await res.json();
        const matched = data.find((item: any) => item.ingredientName === targetName);

        if (matched) {
          setIngredientId(matched.ingredientId ?? null);
          setIsPreferred(matched.type === 'preferred');
          setIsCaution(matched.type === 'caution');
        } else {
          setIngredientId(null);
          setIsPreferred(false);
          setIsCaution(false);
        }
      } catch (err) {
        console.error('성분 상태 확인 실패:', err);
      }
    };

    checkIngredientStatus();
  }, [open, targetName, userId]);

  // Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // /user-ingredients 추가/업데이트
  const saveUserIngredient = async (type: 'preferred' | 'caution') => {
    if (!userId || !targetName) return;

    const d: any = detail || {};
    const ingId = ingredientId ?? d.id ?? null;
    const koreanName: string = d.korean_name || targetName;
    const description: string = d.description || '';
    const cautionGrade: string | null | undefined = d.caution_grade;
    const severity = type === 'caution' ? mapSeverityFromGrade(cautionGrade) : null;

    const body: any = {
      userId: Number(userId),
      userName: storeName || '',
      koreanName,
      ingType: type,
      ingredientId: ingId,
      ingredientName: koreanName,
      type,
      description,
      severity,
    };

    // 수정 2: 백엔드 API_BASE 사용
    const res = await fetch(`${API_BASE}/user-ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to save user ingredient');

    try {
      const json = await res.json();
      if (json && json.ingredientId) {
        setIngredientId(json.ingredientId);
      }
    } catch {
      // 응답이 비어 있어도 동작에는 문제 없음
    }
  };

  // /user-ingredients 삭제
  const deleteUserIngredient = async () => {
    if (!userId || !ingredientId) return;
    // 수정 3: 백엔드 API_BASE 사용
    const res = await fetch(`${API_BASE}/user-ingredients/${userId}/${ingredientId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete user ingredient');
  };

  // 선호 성분 토글
  const handlePreferredToggle = async () => {
    if (!userId || !targetName) return;

    setActionLoading(true);
    try {
      if (isPreferred) {
        await deleteUserIngredient();
        setIsPreferred(false);
      } else {
        await saveUserIngredient('preferred');
        setIsPreferred(true);
        setIsCaution(false);
      }
    } catch (err) {
      console.error('선호 성분 토글 실패:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // 주의 성분 토글
  const handleCautionToggle = async () => {
    if (!userId || !targetName) return;

    setActionLoading(true);
    try {
      if (isCaution) {
        await deleteUserIngredient();
        setIsCaution(false);
      } else {
        await saveUserIngredient('caution');
        setIsCaution(true);
        setIsPreferred(false);
      }
    } catch (err) {
      console.error('주의 성분 토글 실패:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (!open) return null;

  const badge = gradeStyle(detail?.caution_grade ?? null);

  return (
    <AnimatePresence>
      <motion.div
        key="modal-backdrop"
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="modal-panel"
        className="fixed inset-0 z-[101] flex items-center justify-center p-4"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        aria-modal="true"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800">
              {targetName ? `성분 정보 · ${targetName}` : '성분 정보'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="닫기"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-4">
            {loading && <div className="text-sm text-gray-600">불러오는 중입니다…</div>}

            {!loading && error && <div className="text-sm text-red-600">{error}</div>}

            {/* 상세 정보 있는 경우 */}
            {!loading && !error && detail && (
              <div className="space-y-4">
                {/* 등급 뱃지 */}
                <div>
                  <span className="text-sm font-semibold text-gray-700 mr-2">주의 등급</span>
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* 설명 */}
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {detail.description?.trim() || '설명 정보가 없습니다.'}
                </div>

                {/* 선호/주의 성분 버튼 */}
                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={handlePreferredToggle}
                    disabled={actionLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                      isPreferred
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-emerald-50 text-gray-700 hover:bg-green-200 hover:text-emerald-700'
                    } ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Sparkles className="w-4 h-4 text-green-700" />
                    <span className="text-sm">
                      {isPreferred ? '선호 성분 등록됨' : '선호 성분 추가'}
                    </span>
                  </button>

                  <button
                    onClick={handleCautionToggle}
                    disabled={actionLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                      isCaution
                        ? 'bg-red-400 text-white hover:bg-red-300'
                        : 'bg-red-200 text-gray-700 hover:bg-red-300 hover:text-amber-700'
                    } ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <AlertTriangle className="w-4 h-4 text-red-700" />
                    <span className="text-sm">
                      {isCaution ? '주의 성분 등록됨' : '주의 성분 추가'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 상세 정보가 없지만 성분 이름은 있는 경우 */}
            {!loading && !error && !detail && targetName && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  해당 성분의 상세 정보를 찾을 수 없습니다.
                </div>

                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={handlePreferredToggle}
                    disabled={actionLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                      isPreferred
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
                    } ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Sparkles className={`w-4 h-4 ${isPreferred ? 'fill-white' : ''}`} />
                    <span className="text-sm">
                      {isPreferred ? '선호 성분 등록됨' : '선호 성분 추가'}
                    </span>
                  </button>

                  <button
                    onClick={handleCautionToggle}
                    disabled={actionLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                      isCaution
                        ? 'bg-red-300 text-white hover:bg-red-500'
                        : 'bg-gray-100 text-gray-700 hover:bg-amber-50 hover:text-amber-700'
                    } ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <AlertTriangle className={`w-4 h-4 ${isCaution ? 'fill-white' : ''}`} />
                    <span className="text-sm">
                      {isCaution ? '주의 성분 등록됨' : '주의 성분 추가'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:opacity-90"
            >
              닫기
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Chatbot({ userName = 'Sarah', onNavigate }: ChatInterfaceProps) {
  const name = useUserStore(state => state.name);
  const displayName = name || userName || 'U';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: 'ai',
      content: `
안녕하세요  
화장품 추천부터 성분 분석까지, 편하게 물어보시면 도와드릴게요!

**이렇게 물어보실 수 있어요**

• "건성피부가 쓰면 좋은 3만원 이하 촉촉한 수분크림 추천해줘"  
• "나이아신아마이드 성분 설명해줘"  
• 사진을 업로드하면 자동으로 성분을 분석해드려요!

**더 정확하게 상담받는 방법**

• 브랜드·가격대·카테고리(선크림, 크림)를 함께 적으면 더 정확해요.  
• 추천 결과 카드에서 “리뷰 요약 보기 / 성분 보기” 버튼을 눌러 상세 내용을 확인할 수 있어요.
`,
      timestamp: new Date(),
    },
  ]);

  const userId = typeof window !== 'undefined' ? localStorage.getItem('user_id') : null;
  const [favorites, setFavorites] = useState<number[]>([]);

  // 즐겨찾기 불러오기
  useEffect(() => {
    const loadFavorites = async () => {
      if (!userId) return;

      try {
        const res = await fetch(`${API_BASE}/favorite_products/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setFavorites(data.map((item: any) => Number(item.product_id)));
        }
      } catch (err) {
        console.error('즐겨찾기 불러오기 실패', err);
      }
    };

    loadFavorites();
  }, [userId]);

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [savedProducts, setSavedProducts] = useState<number[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openPanelByCard, setOpenPanelByCard] = useState<Record<string, 'review' | 'ings' | null>>(
    {}
  );
  const nextIdRef = useRef<number>(2);

  // 성분 모달 상태
  const [ingModalOpen, setIngModalOpen] = useState(false);
  const [ingTargetName, setIngTargetName] = useState<string | null>(null);
  const [ingDetail, setIngDetail] = useState<IngredientInfo | null>(null);
  const [ingLoading, setIngLoading] = useState(false);
  const [ingError, setIngError] = useState<string | null>(null);
  const ingCacheRef = useRef<Map<string, IngredientInfo>>(new Map());

  // 도움말 모달
  const [helpOpen, setHelpOpen] = useState(false);

  // 세션 복원
  useEffect(() => {
    try {
      const restored = loadSession(SS_KEY);
      if (restored.length) {
        setMessages(restored as Message[]);
        const maxId = restored.reduce((m, x) => Math.max(m, x.id), 0);
        nextIdRef.current = Math.max(maxId + 1, 2);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스크롤 하단 고정
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 세션 저장(디바운스 + 안전저장)
  const scheduleSave = useMemo(() => createSessionSaver(SS_KEY, 200), []);
  useEffect(() => {
    try {
      const recent = messages.slice(-MAX_KEEP);
      const payload: PersistMsg[] = toPersist(recent as MessageLike[]);
      scheduleSave(payload);
    } catch {
      // ignore
    }
  }, [messages, scheduleSave]);

  // 성분 모달 열기
  async function openIngredientModal(name: string) {
    setIngModalOpen(true);
    setIngTargetName(name);
    setIngError(null);
    setIngDetail(null);
    setIngLoading(true);

    try {
      if (ingCacheRef.current.has(name)) {
        setIngDetail(ingCacheRef.current.get(name)!);
      } else {
        const detail = await fetchIngredientDetail(name);
        ingCacheRef.current.set(name, detail);
        setIngDetail(detail);
      }
    } catch (e) {
      setIngError('해당 성분 정보를 찾을 수 없습니다. 배합 목적의 성분일 수도 있어요.');
      console.error(e);
    } finally {
      setIngLoading(false);
    }
  }

  function closeIngredientModal() {
    setIngModalOpen(false);
    setIngTargetName(null);
    setIngDetail(null);
    setIngError(null);
  }

  // 즐겨찾기 토글
  const toggleFavorite = async (productId: number) => {
    if (!userId) {
      setToastMessage('로그인이 필요합니다.');
      setShowToast(true);
      return;
    }

    const isFavorited = favorites.includes(productId);

    try {
      if (isFavorited) {
        const res = await fetch(
          `${API_BASE}/favorite_products/?user_id=${userId}&product_id=${productId}`,
          { method: 'DELETE' }
        );
        if (res.ok) {
          setFavorites(prev => prev.filter(id => id !== productId));
          setToastMessage('즐겨찾기에서 제거되었습니다 💔');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        }
      } else {
        const res = await fetch(
          `${API_BASE}/favorite_products/?user_id=${userId}&product_id=${productId}`,
          { method: 'POST' }
        );
        if (res.ok) {
          setFavorites(prev => [...prev, productId]);
          setToastMessage('즐겨찾기에 추가되었습니다 💗');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        }
      }
    } catch (err) {
      console.error('즐겨찾기 토글 실패', err);
    }
  };

  // 전송 핸들러 (추천 + 요약 스트리밍)
  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text) return;

    const userMsg: Message = {
      id: nextIdRef.current++,
      type: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    const aiMsgId = nextIdRef.current++;
    const aiMsg: Message = {
      id: aiMsgId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsTyping(true);

    try {
      // 1) 추천/검색 + intent + cache_key
      const rec = await fetchRecommendations(text, 12);

      // GENERAL 질의: 스트리밍 없이 바로 답변만
      if (rec.intent === 'GENERAL') {
        const answer =
          (rec.message && rec.message.trim()) ||
          '화장품/피부 관련 일반 질문에 대한 답변을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.';

        setMessages(prev =>
          prev.map(m => (m.id === aiMsgId ? { ...m, content: answer, products: [] } : m))
        );
        setOpenPanelByCard({});
        return;
      }

      // PRODUCT_FIND인데 cache_key 없으면 예외
      if (!rec.cache_key) {
        throw new Error('추천 결과에 cache_key가 없습니다.');
      }

      // 2) 요약 스트리밍
      const stream = await chatStream(text, rec.cache_key);
      for await (const chunk of stream.iter()) {
        setMessages(prev =>
          prev.map(m => (m.id === aiMsgId ? { ...m, content: (m.content || '') + chunk } : m))
        );
      }

      // 3) 제품 카드 붙이기
      const products = rec.products || [];
      setMessages(prev => prev.map(m => (m.id === aiMsgId ? { ...m, products } : m)));

      // 4) 최근 추천 기록 저장
      try {
        const key = `recent_recommendations_${userId}`;
        const prev = JSON.parse(localStorage.getItem(key) || '[]');

        const newEntries = products.map((p: RecProduct) => ({
          product_pid: p.pid,
          display_name: p.product_name,
          image_url: p.image_url,
          price_krw: p.price_krw ?? 0,
          category: p.category,
          source: 'chatbot',
          created_at: new Date().toISOString(),
        }));

        const filtered = prev.filter(
          (item: any) => !newEntries.some(n => n.product_pid === item.product_pid)
        );

        const updated = [...newEntries, ...filtered].slice(0, 30);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (err) {
        console.error('최근 추천 저장 실패:', err);
      }

      setOpenPanelByCard({});
    } catch (err) {
      console.error(err);
      setMessages(prev =>
        prev.map(m => (m.id === aiMsgId ? { ...m, content: '잠시 후 다시 시도해주세요.' } : m))
      );
    } finally {
      setIsTyping(false);
    }
  };

  // 이미지 업로드 → OCR
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    const userMsg: Message = {
      id: nextIdRef.current++,
      type: 'user',
      content: '이 제품 이미지 분석해줘',
      image: localPreview,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    const aiMsgId = nextIdRef.current++;
    const aiMsg: Message = {
      id: aiMsgId,
      type: 'ai',
      content: '분석 중입니다…',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsTyping(true);

    try {
      const { analysis, render } = await uploadOcrImage(file);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? {
                ...m,
                content: render?.text || '분석 결과를 표시할 수 없습니다.',
                image: render?.image_url || undefined,
                analysis,
                ocrImageUrl: render?.image_url ?? null,
              }
            : m
        )
      );
    } catch (err) {
      console.error(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: 'OCR 분석에 실패했습니다. 잠시 후 다시 시도해주세요.' }
            : m
        )
      );
    } finally {
      setIsTyping(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveProduct = (messageId: number) => {
    if (savedProducts.includes(messageId)) {
      setSavedProducts(savedProducts.filter(id => id !== messageId));
      setToastMessage('제품 저장이 취소되었습니다');
    } else {
      setSavedProducts([...savedProducts, messageId]);
      setToastMessage('제품이 저장되었습니다! ✓');
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col pb-16 md:pb-0"
      style={{ background: 'linear-gradient(135deg, #fce7f3 0%, #f3e8ff 50%, #ddd6fe 100%)' }}
    >
      {/* Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-[999]"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <DashboardHeader
        userName={userName}
        onNavigate={onNavigate}
        currentPage="chat"
        aiSavedCount={savedProducts.length}
      />

      {/* Chat */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-4xl flex-1 flex flex-col min-h-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col flex-1 min-h-0 relative"
          >
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
              <AnimatePresence>
                {messages.map(message => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`flex items-start ${
                        message.type === 'user'
                          ? 'flex-row-reverse space-x-reverse gap-3 sm:gap-4'
                          : 'space-x-2 sm:space-x-3'
                      } max-w-[85%] sm:max-w-[80%]`}
                    >
                      {message.type === 'ai' ? (
                        <div className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0">
                          <img
                            src="/ai-droplet.png"
                            alt="AI"
                            className="w-full h-full object-contain"
                            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.15))' }}
                          />
                        </div>
                      ) : (
                        <div
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, #f5c6d9 0%, #e8b4d4 100%)',
                          }}
                        >
                          <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                      )}

                      <div
                        className={`rounded-2xl p-3 sm:p-4 ${
                          message.type === 'user' ? 'text-white' : 'bg-gray-100 text-gray-800'
                        }`}
                        style={
                          message.type === 'user'
                            ? { background: 'linear-gradient(135deg, #f5c6d9 0%, #e8b4d4 100%)' }
                            : {}
                        }
                      >
                        {message.image && message.type === 'user' && (
                          <img
                            src={message.image}
                            alt="Uploaded product"
                            className="rounded-lg mb-2 sm:mb-3 max-w-full w-full sm:max-w-xs"
                          />
                        )}

                        {message.type === 'ai' ? (
                          <div className="prose prose-sm max-w-none leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content || ''}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm sm:text-base whitespace-pre-line break-words">
                            {message.content}
                          </p>
                        )}

                        {/* 추천 제품 카드 */}
                        {message.products && message.products.length > 0 && (
                          <div className="mt-4 space-y-3">
                            <h4 className="text-sm sm:text-base font-semibold text-pink-600">
                              추천 제품
                            </h4>

                            {message.products.slice(0, 6).map((p, i) => {
                              const cardKey = String(
                                `${message.id}-` +
                                  (p.pid ?? `${p.brand ?? ''}-${p.product_name ?? ''}-${i}`)
                              );
                              const open = openPanelByCard[cardKey] ?? null;
                              const toggle = (which: 'review' | 'ings') =>
                                setOpenPanelByCard(prev => ({
                                  ...prev,
                                  [cardKey]: prev[cardKey] === which ? null : which,
                                }));

                              const ingList: { name: string; caution_grade: Grade }[] = (p as any)
                                .ingredients_detail?.length
                                ? ((p as any).ingredients_detail as {
                                    name: string;
                                    caution_grade: Grade;
                                  }[])
                                : (p.ingredients || []).map(n => ({
                                    name: n,
                                    caution_grade: null,
                                  }));

                              const grouped = ingList.reduce(
                                (acc, ing) => {
                                  const k = gradeKey(ing.caution_grade);
                                  (acc[k] = acc[k] || []).push(ing);
                                  return acc;
                                },
                                {} as Record<
                                  '안전' | '주의' | '위험' | '정보없음',
                                  { name: string; caution_grade: Grade }[]
                                >
                              );

                              return (
                                <div
                                  key={cardKey}
                                  className="relative p-3 sm:p-4 bg-white rounded-lg border border-gray-200"
                                >
                                  <div className="flex items-start gap-3">
                                    {/* 즐겨찾기 하트 버튼 */}
                                    <button
                                      onClick={() => toggleFavorite(Number(p.pid))}
                                      className={`absolute top-2 right-2 p-1.5 rounded-full transition ${
                                        favorites.includes(Number(p.pid))
                                          ? 'bg-pink-500 text-white'
                                          : 'bg-white text-pink-500 hover:bg-pink-100'
                                      }`}
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className={`w-4 h-4 ${
                                          favorites.includes(Number(p.pid))
                                            ? 'fill-white'
                                            : 'fill-none'
                                        }`}
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z"
                                        />
                                      </svg>
                                    </button>

                                    {p.image_url && (
                                      <img
                                        src={p.image_url}
                                        alt={p.product_name || ''}
                                        className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                                      />
                                    )}

                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm sm:text-base font-bold text-gray-800 truncate">
                                        {(p.brand ? `${p.brand} · ` : '') + (p.product_name || '')}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {p.category || ''}
                                      </div>

                                      {p.price_krw != null && (
                                        <div className="mt-1 text-sm text-gray-700">
                                          ₩{p.price_krw.toLocaleString()}
                                        </div>
                                      )}

                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {!!p.rag_text && (
                                          <button
                                            type="button"
                                            onClick={() => toggle('review')}
                                            aria-expanded={open === 'review'}
                                            className={`text-xs px-2 py-1 rounded-lg border transition ${
                                              open === 'review'
                                                ? 'bg-pink-50 text-pink-700 border-pink-200'
                                                : 'bg-white text-pink-600 border-pink-200 hover:bg-pink-50'
                                            }`}
                                          >
                                            리뷰 요약 보기
                                          </button>
                                        )}

                                        {ingList.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => toggle('ings')}
                                            aria-expanded={open === 'ings'}
                                            className={`text-xs px-2 py-1 rounded-lg border transition ${
                                              open === 'ings'
                                                ? 'bg-violet-50 text-violet-700 border-violet-200'
                                                : 'bg-white text-violet-600 border-violet-200 hover:bg-violet-50'
                                            }`}
                                          >
                                            성분 보기
                                          </button>
                                        )}

                                        {p.product_url && (
                                          <a
                                            href={p.product_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-white px-3 py-1 rounded-lg"
                                            style={{
                                              background:
                                                'linear-gradient(135deg, #f5c6d9 0%, #e8b4d4 100%)',
                                            }}
                                          >
                                            상품 페이지
                                          </a>
                                        )}
                                      </div>

                                      {open === 'review' && !!p.rag_text && (
                                        <div className="mt-2 text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-2">
                                          {p.rag_text}
                                        </div>
                                      )}

                                      {open === 'ings' && ingList.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                          {(() => {
                                            const MAX_SHOW = 60;
                                            let used = 0;

                                            return GRADE_ORDER.map(section => {
                                              const list = grouped[section] || [];
                                              if (!list.length || used >= MAX_SHOW) return null;

                                              const remain = MAX_SHOW - used;
                                              const slice = list.slice(0, Math.max(0, remain));
                                              used += slice.length;

                                              return (
                                                <div key={section} className="border rounded-lg">
                                                  <div className="px-2 py-1.5 border-b bg-gray-50 text-xs font-semibold text-gray-700">
                                                    {gradeLabel(section)}{' '}
                                                    <span className="font-normal">
                                                      ({list.length})
                                                    </span>
                                                  </div>

                                                  <div className="p-2 flex flex-wrap gap-1.5">
                                                    {slice.map((ing, idx) => (
                                                      <button
                                                        key={`${section}-${idx}`}
                                                        type="button"
                                                        onClick={() =>
                                                          openIngredientModal(ing.name)
                                                        }
                                                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-violet-50 hover:border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300 ${gradeTextClass(
                                                          ing.caution_grade
                                                        )}`}
                                                        title={`${ing.name} 상세 보기`}
                                                      >
                                                        {ing.name}
                                                      </button>
                                                    ))}
                                                  </div>
                                                </div>
                                              );
                                            });
                                          })()}
                                        </div>
                                      )}
                                    </div>

                                    {typeof (p as any).score === 'number' && (
                                      <div className="text-[11px] text-gray-500 ml-2">
                                        sim {(p as any).score.toFixed(3)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* productInfo 카드 (기존 기능 유지) */}
                        {message.productInfo && (
                          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-white rounded-lg">
                            <h4 className="text-sm sm:text-base font-bold text-pink-600 mb-2 flex items-center">
                              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-2 flex-shrink-0" />
                              <span className="break-words">{message.productInfo.name}</span>
                            </h4>
                            <div className="mb-2 sm:mb-3">
                              <p className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                                Key Ingredients:
                              </p>
                              <ul className="space-y-1">
                                {message.productInfo.ingredients.map((ingredient, idx) => (
                                  <li
                                    key={idx}
                                    className="text-xs sm:text-sm text-gray-600 flex items-start"
                                  >
                                    <span className="text-green-500 mr-2 flex-shrink-0">✓</span>
                                    <span className="break-words">{ingredient}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="pt-2 sm:pt-3 border-t border-gray-200 mb-3">
                              <p className="text-xs sm:text-sm text-gray-600 break-words">
                                {message.productInfo.description}
                              </p>
                            </div>
                            <button
                              onClick={() => handleSaveProduct(message.id)}
                              className={`w-full py-2 px-3 rounded-lg flex items-center justify-center space-x-2 transition-all ${
                                savedProducts.includes(message.id)
                                  ? 'bg-pink-500 text-white'
                                  : 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                              }`}
                            >
                              {savedProducts.includes(message.id) ? (
                                <>
                                  <BookmarkCheck className="w-4 h-4" />
                                  <span className="text-xs sm:text-sm font-medium">저장됨</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark className="w-4 h-4" />
                                  <span className="text-xs sm:text-sm font-medium">
                                    제품 저장하기
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <p className="text-xs mt-2 opacity-70">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start space-x-2 sm:space-x-3"
                >
                  <div className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0">
                    <img src="/ai-droplet.png" alt="AI" className="w-full h-full object-contain" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl p-3 sm:p-4">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-3 sm:p-4 bg-white flex-shrink-0">
              <div className="flex items-end space-x-2 sm:space-x-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 sm:p-3 rounded-xl bg-pink-100 text-pink-600 hover:bg-pink-200 transition-colors flex-shrink-0"
                  title="제품 이미지 업로드"
                >
                  <Camera className="w-5 h-5 sm:w-5 sm:h-5" />
                </button>
                <div className="flex-1 flex items-center space-x-2">
                  <textarea
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="제품에 대해 물어보세요..."
                    className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent resize-none max-h-24"
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-pink-200 bg-white text-pink-500 flex items-center justify-center shadow-sm hover:bg-pink-50 transition-colors flex-shrink-0"
                    aria-label="도움말 열기"
                    title="도움말"
                  >
                    <span className="text-sm font-semibold">?</span>
                  </button>

                  <motion.button
                    onClick={handleSendMessage}
                    disabled={inputValue.trim() === ''}
                    className="p-2 sm:p-3 rounded-xl text-white hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #f5c6d9 0%, #e8b4d4 100%)' }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Send className="w-5 h-5 sm:w-5 sm:h-5" />
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <DashboardBottomNav
        onNavigate={onNavigate}
        currentPage="chat"
        chatBadgeCount={savedProducts.length}
      />


      {/* 성분 상세 모달 */}
      <IngredientModal
        open={ingModalOpen}
        onClose={closeIngredientModal}
        targetName={ingTargetName}
        loading={ingLoading}
        error={ingError}
        detail={ingDetail}
      />
      {/* 챗봇 도움말 모달 */}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
