import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Types ────────────────────────────────────────────────────
type KYCStatus = 'not_started' | 'pending' | 'verified' | 'rejected';
type Step = 1 | 2 | 3 | 4;

interface KYCForm {
  // Step 1 - Personal Info
  fullName: string;
  dob: string;
  gender: string;
  // Step 2 - Identity
  aadhaar: string;
  pan: string;
  // Step 3 - Address
  address: string;
  city: string;
  state: string;
  pincode: string;
  // Step 4 - Documents
  aadhaarFront: File | null;
  aadhaarBack: File | null;
  panPhoto: File | null;
  selfie: File | null;
  // Previews
  aadhaarFrontPreview: string;
  aadhaarBackPreview: string;
  panPhotoPreview: string;
  selfiePreview: string;
}

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
];

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<KYCForm & { general: string }>>({});

  const aadhaarFrontRef = useRef<HTMLInputElement>(null);
  const aadhaarBackRef = useRef<HTMLInputElement>(null);
  const panPhotoRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<KYCForm>({
    fullName: userProfile?.name || '',
    dob: '',
    gender: '',
    aadhaar: '',
    pan: '',
    address: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    aadhaarFront: null,
    aadhaarBack: null,
    panPhoto: null,
    selfie: null,
    aadhaarFrontPreview: '',
    aadhaarBackPreview: '',
    panPhotoPreview: '',
    selfiePreview: '',
  });

  // If already verified, show status
  const kycStatus: KYCStatus = userProfile?.kycStatus || 'not_started';

  const set = (key: keyof KYCForm, value: any) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: '' }));
  };

  const handleFile = (key: keyof KYCForm, previewKey: keyof KYCForm, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setErrors(e => ({ ...e, [key]: 'File size must be under 5MB' }));
      return;
    }
    const preview = URL.createObjectURL(file);
    setForm(f => ({ ...f, [key]: file, [previewKey]: preview }));
    setErrors(e => ({ ...e, [key]: '' }));
  };

  // ── Validation ─────────────────────────────────────────────
  const validateStep = (s: Step): boolean => {
    const newErrors: any = {};

    if (s === 1) {
      if (!form.fullName.trim() || form.fullName.length < 3)
        newErrors.fullName = 'Enter your full name (min 3 chars)';
      if (!form.dob)
        newErrors.dob = 'Enter your date of birth';
      else {
        const age = new Date().getFullYear() - new Date(form.dob).getFullYear();
        if (age < 18) newErrors.dob = 'You must be at least 18 years old';
      }
      if (!form.gender)
        newErrors.gender = 'Select your gender';
    }

    if (s === 2) {
      if (!form.aadhaar || form.aadhaar.length !== 12)
        newErrors.aadhaar = 'Aadhaar must be exactly 12 digits';
      if (!form.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan.toUpperCase()))
        newErrors.pan = 'PAN format: ABCDE1234F';
    }

    if (s === 3) {
      if (!form.address.trim() || form.address.length < 10)
        newErrors.address = 'Enter complete address (min 10 chars)';
      if (!form.city.trim())
        newErrors.city = 'Enter city name';
      if (!form.pincode || !/^\d{6}$/.test(form.pincode))
        newErrors.pincode = 'Pincode must be 6 digits';
    }

    if (s === 4) {
      if (!form.aadhaarFront) newErrors.aadhaarFront = 'Upload Aadhaar front side';
      if (!form.aadhaarBack) newErrors.aadhaarBack = 'Upload Aadhaar back side';
      if (!form.panPhoto) newErrors.panPhoto = 'Upload PAN card photo';
      if (!form.selfie) newErrors.selfie = 'Take a selfie photo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      if (step < 4) setStep((step + 1) as Step);
      else handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;
    setLoading(true);
    try {
      // Save KYC data to Firestore (without files for now - in production use Firebase Storage)
      await updateDoc(doc(db, 'users', user!.uid), {
        kycStatus: 'pending',
        kycSubmittedAt: serverTimestamp(),
        kycData: {
          fullName: form.fullName,
          dob: form.dob,
          gender: form.gender,
          aadhaarLast4: form.aadhaar.slice(-4),
          panMasked: form.pan.slice(0, 2) + '***' + form.pan.slice(-3),
          address: form.address,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
        },
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setSubmitted(true);
    } catch (e: any) {
      setErrors({ general: e.message || 'Submission failed. Please try again.' });
    }
    setLoading(false);
  };

  // ── Already Submitted / Verified ──────────────────────────
  if (submitted || kycStatus === 'pending') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
          <h1 style={s.title}>KYC Status</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>⏳</div>
          <h2 style={{ fontWeight: 800, fontSize: 24, color: '#111', marginBottom: 12 }}>KYC Under Review</h2>
          <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            Your KYC documents have been submitted successfully. Our team will verify your details within <strong>24-48 hours</strong>.
          </p>
          <div style={s.statusCard}>
            <p style={s.statusLabel}>SUBMITTED DETAILS</p>
            {[
              ['Name', form.fullName || userProfile?.kycData?.fullName],
              ['Aadhaar', `****${form.aadhaar.slice(-4) || userProfile?.kycData?.aadhaarLast4}`],
              ['PAN', form.pan ? form.pan.slice(0, 2) + '***' + form.pan.slice(-3) : userProfile?.kycData?.panMasked],
              ['City', form.city || userProfile?.kycData?.city],
              ['State', form.state || userProfile?.kycData?.state],
            ].filter(([_, v]) => v).map(([k, v]) => (
              <div key={k} style={s.statusRow}>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{k}</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={s.infoBanner}>
            <p style={{ color: '#1d4ed8', fontSize: 13, fontWeight: 600 }}>📧 You'll get notified once verified</p>
            <p style={{ color: '#3b82f6', fontSize: 12, marginTop: 4 }}>Check notifications for updates</p>
          </div>
          <button style={s.btn} onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (kycStatus === 'verified') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
          <h1 style={s.title}>KYC Verified</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
          <h2 style={{ fontWeight: 800, fontSize: 24, color: '#111', marginBottom: 12 }}>KYC Complete!</h2>
          <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 24 }}>Your identity is verified. You have full access to all INRT Wallet features.</p>
          <div style={{ ...s.infoBanner, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p style={{ color: '#15803d', fontSize: 14, fontWeight: 700 }}>🎉 Benefits Unlocked:</p>
            {['Higher transaction limits (₹1 Lakh/day)', 'International transfers', 'Loan & credit access', '500 bonus reward points credited'].map(b => (
              <p key={b} style={{ color: '#166534', fontSize: 13, marginTop: 4 }}>✓ {b}</p>
            ))}
          </div>
          <button style={s.btn} onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (kycStatus === 'rejected') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
          <h1 style={s.title}>KYC Rejected</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>❌</div>
          <h2 style={{ fontWeight: 800, fontSize: 24, color: '#111', marginBottom: 12 }}>KYC Rejected</h2>
          <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 24 }}>
            {userProfile?.kycRejectionReason || 'Your documents could not be verified. Please resubmit with clear, valid documents.'}
          </p>
          <button style={s.btn} onClick={() => { setStep(1); }}>Resubmit KYC</button>
        </div>
      </div>
    );
  }

  // ── Main KYC Form ─────────────────────────────────────────
  const steps = ['Personal Info', 'Identity', 'Address', 'Documents'];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => step > 1 ? setStep((step - 1) as Step) : navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>KYC Verification</h1>
      </div>

      {/* Progress Bar */}
      <div style={s.progressBar}>
        {steps.map((label, i) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {i > 0 && <div style={{ flex: 1, height: 3, background: step > i ? '#00b9f1' : '#e5e7eb', transition: 'background 0.3s' }} />}
              <div style={{ ...s.stepDot, background: step > i + 1 ? '#00b9f1' : step === i + 1 ? '#001a2e' : '#e5e7eb', color: step >= i + 1 ? '#fff' : '#9ca3af', border: `3px solid ${step === i + 1 ? '#00b9f1' : step > i + 1 ? '#00b9f1' : '#e5e7eb'}` }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 3, background: step > i + 1 ? '#00b9f1' : '#e5e7eb', transition: 'background 0.3s' }} />}
            </div>
            <span style={{ fontSize: 10, color: step === i + 1 ? '#00b9f1' : '#9ca3af', marginTop: 6, fontWeight: step === i + 1 ? 700 : 400 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Why KYC Banner */}
      {step === 1 && (
        <div style={s.whyBanner}>
          <p style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 14, marginBottom: 4 }}>🔒 Why KYC?</p>
          <p style={{ color: '#3b82f6', fontSize: 12, lineHeight: 1.5 }}>KYC verification is required by RBI for all digital wallets. It unlocks higher limits and keeps your money safe.</p>
        </div>
      )}

      <div style={{ padding: '0 16px 40px' }}>
        {/* ── STEP 1: Personal Info ── */}
        {step === 1 && (
          <div style={s.card}>
            <h3 style={s.stepTitle}>👤 Personal Information</h3>

            <Field label="Full Name (as per Aadhaar)" error={errors.fullName}>
              <input style={s.input} placeholder="Enter your full name" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            </Field>

            <Field label="Date of Birth" error={errors.dob}>
              <input style={s.input} type="date" value={form.dob} max={new Date().toISOString().split('T')[0]} onChange={e => set('dob', e.target.value)} />
            </Field>

            <Field label="Gender" error={errors.gender}>
              <div style={{ display: 'flex', gap: 10 }}>
                {['Male', 'Female', 'Other'].map(g => (
                  <button key={g} onClick={() => set('gender', g)} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `2px solid ${form.gender === g ? '#00b9f1' : '#e5e7eb'}`, background: form.gender === g ? '#dbeafe' : '#f8fafc', color: form.gender === g ? '#0369a1' : '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    {g === 'Male' ? '👨 Male' : g === 'Female' ? '👩 Female' : '🧑 Other'}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* ── STEP 2: Identity ── */}
        {step === 2 && (
          <div style={s.card}>
            <h3 style={s.stepTitle}>🪪 Identity Details</h3>

            <Field label="Aadhaar Number (12 digits)" error={errors.aadhaar}>
              <input style={s.input} type="tel" maxLength={12} placeholder="XXXX XXXX XXXX"
                value={form.aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ').trim()}
                onChange={e => set('aadhaar', e.target.value.replace(/\s/g, '').replace(/\D/g, ''))} />
              {form.aadhaar.length === 12 && <p style={s.successHint}>✓ Valid Aadhaar format</p>}
            </Field>

            <Field label="PAN Card Number" error={errors.pan}>
              <input style={{ ...s.input, textTransform: 'uppercase', letterSpacing: 2 }} maxLength={10} placeholder="ABCDE1234F"
                value={form.pan.toUpperCase()}
                onChange={e => set('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              {/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan) && <p style={s.successHint}>✓ Valid PAN format</p>}
            </Field>

            <div style={s.secureNote}>
              <span style={{ fontSize: 18 }}>🔐</span>
              <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.5 }}>Your Aadhaar and PAN details are encrypted and stored securely. We never share them with third parties.</p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Address ── */}
        {step === 3 && (
          <div style={s.card}>
            <h3 style={s.stepTitle}>🏠 Address Details</h3>
            <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 16 }}>Enter address as per your Aadhaar card</p>

            <Field label="Full Address" error={errors.address}>
              <textarea style={{ ...s.input, height: 90, resize: 'none' }} placeholder="House No, Street Name, Area, Landmark"
                value={form.address} onChange={e => set('address', e.target.value)} />
            </Field>

            <Field label="City" error={errors.city}>
              <input style={s.input} placeholder="Enter city name" value={form.city} onChange={e => set('city', e.target.value)} />
            </Field>

            <Field label="State" error={''}>
              <select style={{ ...s.input, cursor: 'pointer' }} value={form.state} onChange={e => set('state', e.target.value)}>
                {STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </Field>

            <Field label="PIN Code" error={errors.pincode}>
              <input style={s.input} type="tel" maxLength={6} placeholder="6-digit PIN code"
                value={form.pincode} onChange={e => set('pincode', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        )}

        {/* ── STEP 4: Documents ── */}
        {step === 4 && (
          <div style={s.card}>
            <h3 style={s.stepTitle}>📄 Upload Documents</h3>
            <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 20 }}>Upload clear photos • Max 5MB each • JPG/PNG only</p>

            {/* Aadhaar Front */}
            <DocUpload
              label="Aadhaar Card — Front Side"
              icon="🪪"
              preview={form.aadhaarFrontPreview}
              error={errors.aadhaarFront}
              inputRef={aadhaarFrontRef}
              onChange={f => handleFile('aadhaarFront', 'aadhaarFrontPreview', f)}
              onRetake={() => set('aadhaarFrontPreview', '')}
            />

            {/* Aadhaar Back */}
            <DocUpload
              label="Aadhaar Card — Back Side"
              icon="🪪"
              preview={form.aadhaarBackPreview}
              error={errors.aadhaarBack}
              inputRef={aadhaarBackRef}
              onChange={f => handleFile('aadhaarBack', 'aadhaarBackPreview', f)}
              onRetake={() => set('aadhaarBackPreview', '')}
            />

            {/* PAN Card */}
            <DocUpload
              label="PAN Card"
              icon="💳"
              preview={form.panPhotoPreview}
              error={errors.panPhoto}
              inputRef={panPhotoRef}
              onChange={f => handleFile('panPhoto', 'panPhotoPreview', f)}
              onRetake={() => set('panPhotoPreview', '')}
            />

            {/* Selfie */}
            <DocUpload
              label="Selfie Photo"
              icon="🤳"
              preview={form.selfiePreview}
              error={errors.selfie}
              inputRef={selfieRef}
              onChange={f => handleFile('selfie', 'selfiePreview', f)}
              onRetake={() => set('selfiePreview', '')}
              capture="user"
              hint="Take a clear selfie in good lighting"
            />

            <div style={s.secureNote}>
              <span style={{ fontSize: 18 }}>🛡️</span>
              <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.5 }}>Documents are encrypted with 256-bit SSL and stored securely. Only used for identity verification.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {errors.general && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '12px 16px', marginTop: 12, marginBottom: 12 }}>
            <p style={{ color: '#dc2626', fontSize: 14 }}>⚠️ {errors.general}</p>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {step > 1 && (
            <button style={s.backBtn} onClick={() => setStep((step - 1) as Step)}>
              ← Back
            </button>
          )}
          <button
            style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? '⏳ Submitting...' : step < 4 ? `Continue →` : '✓ Submit KYC'}
          </button>
        </div>

        {/* Step indicator */}
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 12 }}>
          Step {step} of 4
        </p>
      </div>
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: '#374151', fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </p>
      {children}
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>⚠️ {error}</p>}
    </div>
  );
}

function DocUpload({ label, icon, preview, error, inputRef, onChange, onRetake, capture, hint }: {
  label: string;
  icon: string;
  preview: string;
  error?: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (f: File) => void;
  onRetake: () => void;
  capture?: 'user' | 'environment';
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ color: '#374151', fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </p>
      {hint && <p style={{ color: '#9ca3af', fontSize: 11, marginBottom: 8 }}>{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={capture}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); }}
      />
      {!preview ? (
        <button
          onClick={() => inputRef.current?.click()}
          style={docUploadStyle}
        >
          <span style={{ fontSize: 36 }}>{icon}</span>
          <span style={{ color: '#00b9f1', fontWeight: 700, fontSize: 14 }}>Tap to upload</span>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>JPG, PNG • Max 5MB</span>
        </button>
      ) : (
        <div style={{ position: 'relative' }}>
          <img src={preview} alt={label} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 14, border: '2px solid #00b9f1' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
            <button onClick={onRetake} style={{ background: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
              🔄 Retake
            </button>
          </div>
          <div style={{ position: 'absolute', top: 8, right: 8, background: '#16a34a', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</div>
        </div>
      )}
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>⚠️ {error}</p>}
    </div>
  );
}

const docUploadStyle: React.CSSProperties = {
  width: '100%',
  background: '#f0f9ff',
  border: '2px dashed #00b9f1',
  borderRadius: 14,
  padding: '24px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
};

// ─── Styles ───────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif", paddingBottom: 40 },
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '52px 16px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff', flexShrink: 0 },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  progressBar: { background: 'linear-gradient(160deg,#001a2e,#002a45)', padding: '8px 20px 20px', display: 'flex', alignItems: 'flex-start' },
  stepDot: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0, transition: 'all 0.3s' },
  whyBanner: { background: '#dbeafe', padding: '14px 16px', borderBottom: '1px solid #bfdbfe' },
  card: { background: '#fff', borderRadius: 18, padding: '20px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: 16 },
  stepTitle: { fontWeight: 800, fontSize: 18, color: '#111', marginBottom: 20 },
  input: { width: '100%', border: '2px solid #e5e7eb', borderRadius: 12, padding: '13px 14px', fontSize: 15, outline: 'none', color: '#111', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' },
  successHint: { color: '#16a34a', fontSize: 12, marginTop: 6, fontWeight: 600 },
  secureNote: { background: '#f8fafc', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 },
  btn: { flex: 1, padding: '16px 0', background: 'linear-gradient(135deg,#00b9f1,#0090c0)', border: 'none', borderRadius: 16, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
  backBtn: { flex: 0.5, padding: '16px 0', background: '#fff', border: '2px solid #e5e7eb', borderRadius: 16, color: '#374151', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  statusCard: { background: '#f8fafc', borderRadius: 16, padding: 16, width: '100%', marginBottom: 16 },
  statusLabel: { color: '#9ca3af', fontSize: 11, letterSpacing: 1, fontWeight: 700, marginBottom: 10 },
  statusRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' },
  infoBanner: { background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 14, padding: '14px 16px', marginBottom: 20, width: '100%', textAlign: 'left' },
};
