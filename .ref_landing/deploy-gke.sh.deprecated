#!/usr/bin/env bash
# ==============================================================================
# OrchestreeAI Admin Dashboard - Manual / Scripted GKE Deployment
# ==============================================================================
set -euo pipefail

echo ">>> Memulai deployment OrchestreeAI Admin Dashboard ke GKE <<<"

# 1. Resolusi eksplisit GCP PROJECT_ID
PROJECT_ID="${PROJECT_ID:-}"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
fi
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "PROJECT_ID" ]; then
  PROJECT_ID="orchestree-ai"
fi

# 2. Validasi ketat: gagalkan proses jika PROJECT_ID kosong atau masih literal placeholder
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "PROJECT_ID" ]; then
  echo "❌ ERROR: PROJECT_ID kosong atau bernilai literal 'PROJECT_ID'!" >&2
  echo "Pastikan gcloud sudah login dan project aktif dipilih (gcloud config set project orchestree-ai)." >&2
  exit 1
fi

echo "✅ Menggunakan GCP PROJECT_ID: $PROJECT_ID"

# 3. Parameter Deployment
NAMESPACE="${NAMESPACE:-orchestreeai-admin}"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
IMAGE_URL="asia-southeast2-docker.pkg.dev/${PROJECT_ID}/orchestreeai-images/admin-dashboard:${TAG}"

SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
SUPABASE_URL="${VITE_SUPABASE_URL:-https://exfvfyiwftywqjcsofgf.supabase.co}"
BACKEND_API_URL="${VITE_BACKEND_API_URL:-https://api.orchestree.biz.id/api/v1}"

# ==============================================================================
# BUG 2 FIX: Validasi ketat VITE_SUPABASE_ANON_KEY & SUPABASE_URL sebelum build
# ==============================================================================
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ ERROR: VITE_SUPABASE_ANON_KEY kosong! Export env var ini sebelum menjalankan script:" >&2
  echo "  export VITE_SUPABASE_ANON_KEY=\"<key-dari-supabase-dashboard>\"" >&2
  exit 1
fi
echo "✅ VITE_SUPABASE_ANON_KEY terdeteksi (panjang: ${#SUPABASE_ANON_KEY} karakter)"

if [ -z "$SUPABASE_URL" ]; then
  echo "❌ ERROR: VITE_SUPABASE_URL kosong! Export env var ini sebelum menjalankan script:" >&2
  echo "  export VITE_SUPABASE_URL=\"https://<project-ref>.supabase.co\"" >&2
  exit 1
fi
echo "✅ VITE_SUPABASE_URL terdeteksi: $SUPABASE_URL"

echo ">>> Building dan Pushing container image: ${IMAGE_URL} <<<"
if command -v docker &>/dev/null; then
  echo ">>> Menggunakan Docker lokal dengan build-args <<<"
  gcloud auth configure-docker asia-southeast2-docker.pkg.dev --quiet || true
  docker build \
    --build-arg VITE_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}" \
    --build-arg VITE_SUPABASE_URL="${SUPABASE_URL}" \
    --build-arg VITE_BACKEND_API_URL="${BACKEND_API_URL}" \
    --build-arg NEXT_PUBLIC_BACKEND_API_URL="${BACKEND_API_URL}" \
    -t "${IMAGE_URL}" \
    .

  # ============================================================================
  # BUG 3 FIX: Verifikasi pasca-build bahwa key benar-benar masuk ke bundle JS
  # ============================================================================
  echo ">>> Verifikasi build-arg berhasil ter-inject ke bundle <<<"
  CONTAINER_ID=$(docker create "${IMAGE_URL}")
  rm -rf /tmp/dist-check
  docker cp "${CONTAINER_ID}:/usr/share/nginx/html" /tmp/dist-check
  docker rm "${CONTAINER_ID}"
  if ! grep -rq "${SUPABASE_ANON_KEY:0:10}" /tmp/dist-check/assets/*.js 2>/dev/null; then
    echo "❌ ERROR: VITE_SUPABASE_ANON_KEY tidak ditemukan di bundle JS hasil build!" >&2
    rm -rf /tmp/dist-check
    exit 1
  fi
  echo "✅ Kunci Supabase terkonfirmasi ada di bundle JS."
  rm -rf /tmp/dist-check

  docker push "${IMAGE_URL}"
else
  echo ">>> Docker tidak ditemukan, menggunakan Google Cloud Build (cloudbuild.yaml) <<<"
  gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions="_IMAGE_REPO=asia-southeast2-docker.pkg.dev/${PROJECT_ID}/orchestreeai-images,_IMAGE_TAG=${TAG},_VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY},_VITE_SUPABASE_URL=${SUPABASE_URL},_VITE_BACKEND_API_URL=${BACKEND_API_URL}" \
    .
fi

echo ">>> Menerapkan image baru ke Deployment admin-dashboard di namespace ${NAMESPACE} <<<"
kubectl set image deployment/admin-dashboard \
  admin-dashboard="${IMAGE_URL}" \
  -n "${NAMESPACE}"

echo ">>> Menunggu rollout status selesai <<<"
kubectl rollout status deployment/admin-dashboard -n "${NAMESPACE}" --timeout=180s

echo "✅ Rollout selesai dengan sukses!"

