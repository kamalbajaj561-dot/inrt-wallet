/**
 * INRT WALLET — PrivacyPolicy.tsx
 * Add route in App.tsx: <Route path="/privacy" element={<PrivacyPolicy />} />
 */

import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  const sections = [
    {
      title: '1. Information We Collect',
      content: [
        {
          sub: '1.1 Personal Information',
          text: 'When you register for INRT Wallet, we collect your full name, mobile number, email address, date of birth, and government-issued identity documents (Aadhaar number, PAN card) for KYC (Know Your Customer) compliance as required by the Reserve Bank of India (RBI) and Prevention of Money Laundering Act (PMLA) regulations.',
        },
        {
          sub: '1.2 Financial Information',
          text: 'We collect transaction history, wallet balance, bank account details (account number, IFSC code), UPI IDs, and payment method information to facilitate financial services. We do not store full card numbers or CVV details.',
        },
        {
          sub: '1.3 Device & Technical Information',
          text: 'We automatically collect device identifiers, IP address, browser type, operating system, app version, and usage analytics to improve our services, detect fraud, and ensure security.',
        },
        {
          sub: '1.4 Location Information',
          text: 'With your consent, we may collect approximate location data to detect suspicious activity, comply with regulatory requirements, and provide location-based services.',
        },
      ],
    },
    {
      title: '2. How We Use Your Information',
      content: [
        { sub: '2.1 Service Delivery', text: 'To process payments, transfers, recharges, bill payments, and all other wallet services you request.' },
        { sub: '2.2 KYC & Compliance', text: 'To verify your identity as required by RBI guidelines, PMLA regulations, and other applicable Indian laws. KYC data is shared with our verification partners (currently IDfy / Surepass) and retained as required by law.' },
        { sub: '2.3 Fraud Prevention', text: 'To detect, investigate, and prevent fraudulent transactions, unauthorized access, and other illegal activities.' },
        { sub: '2.4 Communication', text: 'To send transaction alerts, OTPs, promotional offers, product updates, and service notifications via SMS, email, and push notifications.' },
        { sub: '2.5 Legal Obligations', text: 'To comply with court orders, regulatory requirements, and lawful requests from government authorities including tax departments and law enforcement.' },
      ],
    },
    {
      title: '3. INRT Token & Cryptocurrency',
      content: [
        { sub: '3.1 INRT Stablecoin', text: 'INRT is a utility token pegged to the Indian Rupee (1 INRT = ₹1). It is used exclusively within the INRT Wallet ecosystem for payments, rewards, and cross-border transactions. INRT is not an investment product and does not represent equity or ownership.' },
        { sub: '3.2 Blockchain Data', text: 'If you use INRT for blockchain transactions, your wallet address and transaction data may be recorded on a public blockchain. This data is pseudonymous but permanently visible on the blockchain.' },
        { sub: '3.3 Tax Compliance', text: 'INRT transactions may be subject to 30% tax on gains and 1% TDS as per Section 194S of the Income Tax Act, 1961. We may report transaction data to Income Tax authorities as required by law.' },
      ],
    },
    {
      title: '4. Data Sharing & Disclosure',
      content: [
        { sub: '4.1 Service Providers', text: 'We share data with trusted third-party service providers including payment processors (Instamojo, Cashfree), KYC providers (IDfy), recharge APIs (Ezytm), cloud infrastructure (Firebase, Railway), and analytics providers. All partners are bound by confidentiality agreements.' },
        { sub: '4.2 Regulatory Authorities', text: 'We may share information with RBI, NPCI, FIU-IND, SEBI, Income Tax Department, and other regulatory bodies as required by applicable law.' },
        { sub: '4.3 Business Transfers', text: 'In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity, subject to the same privacy protections.' },
        { sub: '4.4 No Sale of Data', text: 'We do not sell, rent, or trade your personal information to third parties for their marketing purposes.' },
      ],
    },
    {
      title: '5. Data Security',
      content: [
        { sub: '5.1 Encryption', text: 'All sensitive data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption. Passwords are hashed using industry-standard algorithms.' },
        { sub: '5.2 Access Controls', text: 'Access to personal data is restricted to authorized personnel on a need-to-know basis. All access is logged and audited.' },
        { sub: '5.3 Incident Response', text: 'In case of a data breach affecting your rights, we will notify you within 72 hours as required by applicable regulations.' },
      ],
    },
    {
      title: '6. Data Retention',
      content: [
        { sub: '6.1 Retention Period', text: 'We retain your personal data for a minimum of 5 years after account closure as required by PMLA and RBI regulations. KYC documents are retained for 5 years post-relationship.' },
        { sub: '6.2 Transaction Records', text: 'Transaction records are retained for 8 years as required by income tax and financial regulations.' },
      ],
    },
    {
      title: '7. Your Rights',
      content: [
        { sub: '7.1 Access & Correction', text: 'You may request access to your personal data and correct any inaccuracies through the app settings or by contacting support@inrtwallet.in.' },
        { sub: '7.2 Account Deletion', text: 'You may request deletion of your account. However, some data must be retained as required by law even after deletion.' },
        { sub: '7.3 Opt-Out', text: 'You may opt out of promotional communications at any time. Transactional and legal communications cannot be opted out of.' },
      ],
    },
    {
      title: '8. Cookies & Tracking',
      content: [
        { sub: '8.1 Cookies', text: 'We use cookies and similar technologies for session management, security, analytics, and personalization. You can control cookie settings in your browser, though this may affect app functionality.' },
      ],
    },
    {
      title: '9. Children\'s Privacy',
      content: [
        { sub: '9.1 Age Restriction', text: 'INRT Wallet is not intended for persons under 18 years of age. We do not knowingly collect personal information from minors. If we discover we have collected data from a minor, we will delete it immediately.' },
      ],
    },
    {
      title: '10. Changes to This Policy',
      content: [
        { sub: '10.1 Updates', text: 'We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification at least 7 days before the changes take effect. Continued use of the app after changes constitutes acceptance.' },
      ],
    },
    {
      title: '11. Contact Us',
      content: [
        { sub: 'Grievance Officer', text: 'For privacy concerns, contact our Grievance Officer:\nName: Kamal Bajaj\nEmail: privacy@inrtwallet.in\nAddress: India\nResponse time: Within 30 days' },
      ],
    },
  ];

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>←</button>
        <h1 style={S.headerTitle}>Privacy Policy</h1>
      </div>

      <div style={S.body}>
        {/* Intro */}
        <div style={S.introCard}>
          <p style={S.introTitle}>🔒 Your Privacy Matters</p>
          <p style={S.introText}>
            This Privacy Policy explains how INRT Wallet ("we", "our", "us") collects, uses, shares, and protects your information when you use our payment application and related services.
          </p>
          <p style={S.introText}>
            <strong style={{ color: '#fff' }}>Effective Date:</strong> {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p style={{ ...S.introText, margin: 0 }}>
            <strong style={{ color: '#fff' }}>Applicable to:</strong> inrtwallet.in and INRT Wallet mobile/web application
          </p>
        </div>

        {/* Sections */}
        {sections.map((section, i) => (
          <div key={i} style={S.section}>
            <h2 style={S.sectionTitle}>{section.title}</h2>
            {section.content.map((item, j) => (
              <div key={j} style={S.item}>
                <p style={S.itemSub}>{item.sub}</p>
                <p style={S.itemText}>{item.text}</p>
              </div>
            ))}
          </div>
        ))}

        {/* Footer note */}
        <div style={S.footerCard}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', margin: 0, lineHeight: 1.7 }}>
            By using INRT Wallet, you acknowledge that you have read, understood, and agree to this Privacy Policy.
            This policy is governed by the laws of India.
          </p>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#050914', fontFamily: "'Plus Jakarta Sans',sans-serif" },
  header:      { background: 'linear-gradient(160deg,#050914,#0a1428)', padding: '52px 20px 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  backBtn:     { background: 'none', border: 'none', color: '#00e5cc', fontSize: 22, cursor: 'pointer', lineHeight: 1, flexShrink: 0 },
  headerTitle: { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 20, color: '#fff', margin: 0 },
  body:        { padding: '16px 16px 60px' },
  introCard:   { background: 'linear-gradient(135deg,rgba(0,112,243,0.15),rgba(123,47,190,0.15))', border: '1px solid rgba(0,112,243,0.2)', borderRadius: 18, padding: '20px 18px', marginBottom: 20 },
  introTitle:  { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#fff', margin: '0 0 10px' },
  introText:   { color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 8px', lineHeight: 1.7 },
  section:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 16px', marginBottom: 12 },
  sectionTitle:{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: '#00e5cc', margin: '0 0 14px' },
  item:        { marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' },
  itemSub:     { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 13, color: '#fff', margin: '0 0 6px' },
  itemText:    { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0, lineHeight: 1.8 },
  footerCard:  { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '16px', marginTop: 8 },
};
