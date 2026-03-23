const form = document.getElementById('etaForm');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const compareBtn = document.getElementById('compareBtn');
const historyChart = document.getElementById('historyChart');

const outputRefs = {
  etaValue: document.getElementById('etaValue'),
  etaSummary: document.getElementById('etaSummary'),
  speedValue: document.getElementById('speedValue'),
  speedDetail: document.getElementById('speedDetail'),
  stepsValue: document.getElementById('stepsValue'),
  stepsDetail: document.getElementById('stepsDetail'),
  adjustmentValue: document.getElementById('adjustmentValue'),
  adjustmentDetail: document.getElementById('adjustmentDetail'),
  defaultEta: document.getElementById('defaultEta'),
  modelConfidence: document.getElementById('modelConfidence'),
  recommendation: document.getElementById('recommendation'),
  insightBadge: document.getElementById('insightBadge'),
};

const timeFactors = {
  morning: 0.96,
  midday: 1.02,
  evening: 0.98,
  night: 0.92,
};

const fatigueFactors = {
  low: 1.04,
  medium: 0.99,
  high: 0.9,
};

const sampleProfile = {
  height: 168,
  weight: 62,
  stride: 0.71,
  cadence: 114,
  gpsSpeed: 5.1,
  sensorConfidence: 88,
  distance: 3.2,
  slope: 2.2,
  timeOfDay: 'morning',
  fatigue: 'low',
  weeklySteps: 9800,
  etaError: 5.8,
};

function toNumber(formData, key) {
  return Number(formData.get(key));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatMinutes(totalMinutes) {
  const rounded = Math.max(1, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

function formatSignedPercent(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function buildHistory(baseSpeed, personalizedSpeed) {
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  const baseSeries = labels.map((_, index) => {
    const wave = Math.sin(index * 1.1) * 0.22;
    return Math.max(2.8, baseSpeed + wave - 0.18 + index * 0.02);
  });

  return labels.map((label, index) => ({
    label,
    base: Number(baseSeries[index].toFixed(2)),
    ai: Number((personalizedSpeed + Math.cos(index * 0.85) * 0.18 - 0.1).toFixed(2)),
  }));
}

function renderHistory(history) {
  historyChart.innerHTML = '';
  const maxValue = Math.max(...history.flatMap(item => [item.base, item.ai]), 6);

  history.forEach((item) => {
    const day = document.createElement('div');
    day.className = 'chart-day';

    const bars = document.createElement('div');
    bars.className = 'chart-bars';

    const baseBar = document.createElement('div');
    baseBar.className = 'chart-bar base';
    baseBar.style.height = `${(item.base / maxValue) * 180}px`;
    baseBar.title = `${item.label} 센서 속도 ${item.base} km/h`;

    const aiBar = document.createElement('div');
    aiBar.className = 'chart-bar ai';
    aiBar.style.height = `${(item.ai / maxValue) * 180}px`;
    aiBar.title = `${item.label} AI 속도 ${item.ai} km/h`;

    bars.append(baseBar, aiBar);

    const label = document.createElement('span');
    label.textContent = item.label;

    const speed = document.createElement('span');
    speed.textContent = `${item.ai.toFixed(1)} km/h`;

    day.append(bars, label, speed);
    historyChart.appendChild(day);
  });
}

function getRecommendation({ personalizedSpeed, slope, fatigue, etaGapMinutes, confidence }) {
  if (confidence < 65) {
    return '센서 신뢰도가 낮습니다. GPS와 걸음 수 데이터를 조금 더 수집하면 ETA가 안정됩니다.';
  }
  if (slope >= 6 || fatigue === 'high') {
    return '오르막/피로 영향이 큽니다. 출발 전에 3~5분 여유를 추가하는 것을 추천합니다.';
  }
  if (etaGapMinutes <= -3) {
    return '평균 지도 ETA보다 빠른 보행 패턴입니다. 평소 루틴 경로에서 개인화 ETA를 우선 사용하세요.';
  }
  if (personalizedSpeed < 4.2) {
    return '현재 보행 속도가 평균보다 느립니다. 지도 ETA보다 늦게 도착할 가능성을 안내하세요.';
  }
  return '현재 패턴으로는 도착 시간 예측이 안정적입니다.';
}

function calculatePrediction() {
  const formData = new FormData(form);
  const height = toNumber(formData, 'height');
  const weight = toNumber(formData, 'weight');
  const stride = toNumber(formData, 'stride');
  const cadence = toNumber(formData, 'cadence');
  const gpsSpeed = toNumber(formData, 'gpsSpeed');
  const sensorConfidence = toNumber(formData, 'sensorConfidence');
  const distance = toNumber(formData, 'distance');
  const slope = toNumber(formData, 'slope');
  const weeklySteps = toNumber(formData, 'weeklySteps');
  const etaError = toNumber(formData, 'etaError');
  const timeOfDay = formData.get('timeOfDay');
  const fatigue = formData.get('fatigue');

  const sensorSpeed = stride * cadence * 60 / 1000;
  const confidenceWeight = clamp(sensorConfidence / 100, 0, 1);
  const blendedSpeed = sensorSpeed * (0.55 + confidenceWeight * 0.2) + gpsSpeed * (0.45 - confidenceWeight * 0.2 + 0.15);

  const heightFactor = clamp(1 + (height - 170) / 600, 0.9, 1.08);
  const weightFactor = clamp(1 - Math.max(weight - 75, 0) / 500, 0.9, 1.03);
  const trainingFactor = clamp(1 + (weeklySteps - 7000) / 40000, 0.92, 1.08);
  const slopeFactor = slope >= 0 ? clamp(1 - slope * 0.028, 0.72, 1.02) : clamp(1 + Math.abs(slope) * 0.015, 0.98, 1.08);
  const errorFactor = clamp(1 - etaError / 180, 0.82, 1.02);
  const timeFactor = timeFactors[timeOfDay] ?? 1;
  const fatigueFactor = fatigueFactors[fatigue] ?? 1;

  const aiFactor = heightFactor * weightFactor * trainingFactor * slopeFactor * errorFactor * timeFactor * fatigueFactor;
  const personalizedSpeed = clamp(blendedSpeed * aiFactor, 2.5, 7.8);
  const personalizedEtaMinutes = distance / personalizedSpeed * 60;
  const defaultEtaMinutes = distance / 4.5 * 60;
  const etaGapMinutes = personalizedEtaMinutes - defaultEtaMinutes;
  const expectedSteps = Math.round((distance * 1000) / stride);
  const adjustmentPercent = ((personalizedSpeed / blendedSpeed) - 1) * 100;
  const confidence = Math.round(clamp(sensorConfidence + (12 - etaError) * 1.4, 45, 98));

  outputRefs.etaValue.textContent = formatMinutes(personalizedEtaMinutes);
  outputRefs.etaSummary.textContent = etaGapMinutes < 0
    ? `평균 지도 ETA보다 ${Math.abs(Math.round(etaGapMinutes))}분 빠릅니다.`
    : `평균 지도 ETA보다 ${Math.round(etaGapMinutes)}분 느립니다.`;

  outputRefs.speedValue.textContent = `${personalizedSpeed.toFixed(1)} km/h`;
  outputRefs.speedDetail.textContent = `센서 속도 ${sensorSpeed.toFixed(1)} km/h + GPS ${gpsSpeed.toFixed(1)} km/h 혼합`;
  outputRefs.stepsValue.textContent = `${expectedSteps.toLocaleString('ko-KR')} 보`;
  outputRefs.stepsDetail.textContent = `${distance.toFixed(1)}km 이동 시 필요한 총 걸음 수 추정`;
  outputRefs.adjustmentValue.textContent = formatSignedPercent(adjustmentPercent);
  outputRefs.adjustmentDetail.textContent = `시간대 ${timeOfDay} · 피로도 ${fatigue} · 경사 ${slope}% 반영`;
  outputRefs.defaultEta.textContent = formatMinutes(defaultEtaMinutes);
  outputRefs.modelConfidence.textContent = `신뢰도 ${confidence}%`;
  outputRefs.recommendation.textContent = getRecommendation({ personalizedSpeed, slope, fatigue, etaGapMinutes, confidence });
  outputRefs.insightBadge.textContent = confidence >= 80 ? '학습 완료' : '추가 학습 필요';

  renderHistory(buildHistory(sensorSpeed, personalizedSpeed));
}

function setFormValues(values) {
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
  calculatePrediction();
}

form.addEventListener('input', calculatePrediction);
form.addEventListener('change', calculatePrediction);
loadSampleBtn.addEventListener('click', () => setFormValues(sampleProfile));
compareBtn.addEventListener('click', () => {
  const defaultEta = outputRefs.defaultEta.textContent;
  const personalizedEta = outputRefs.etaValue.textContent;
  window.alert(`기본 지도 ETA: ${defaultEta}\n개인화 ETA: ${personalizedEta}`);
});

calculatePrediction();
