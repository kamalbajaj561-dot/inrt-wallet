/**
 * INRT WALLET — RefundPolicy.tsx
 * Add route in App.tsx: <Route path="/refund-policy" element={<RefundPolicy />} />
 */

import { useNavigate } from 'react-router-dom';

export default function RefundPolicy() {
  const navigate = useNavigate();

  const sections = [
    {
      title: '1. Overview',
      content: [
        {
          sub: '1.1 Our Commitment',
          text: 'INRT Wallet is committed to ensuring a fair and transparent refund process. This policy outlines the circumstances under which refunds are processed and the timelines involved.',
        },
        {
          sub: '1.2 Scope',
          text: 'This policy applies to all transactions made through the INRT Wallet platform including wallet top-ups, peer-to-peer transfers, mobile recharges, bill payments, and INRT token transactions.',
        },
      ],
    },
    {
      title: '2. Wallet Top-Up (Add Money)',
      content: [
        {
          sub: '2.1 Successful Top-Up',
          text: 'Once money is successfully added to your INRT wallet, it cannot be refunded back to the original payment source. The wallet balance can be used for transactions within the app or withdrawn to your linked bank account.',
        },
        {
          sub: '2.2 Failed Top-Up — Amount Deducted',
          text: 'If your payment was deducted from your bank/card but not credited to your wallet:\n• Automatic refund within 3-5 business days\n• If not received in 5 days, contact support@inrtwallet.in with your bank transaction reference\n• We will investigate and credit within 7 working days',
        },
        {
          sub: '2.3 Double Deduction',
          text: 'If you were charged twice for a single transaction, the duplicate amount will be automatically reversed within 3-5 business days. Please contact support if not resolved automatically.',
        },
      ],
    },
    {
      title: '3. Peer-to-Peer (P2P) Transfers',
      content: [
        {
          sub: '3.1 No Reversal Policy',
          text: 'Wallet-to-wallet transfers between INRT users are instant and final. Once a transfer is completed, it CANNOT be reversed. Always double-check the recipient\'s phone number, UPI ID, or username before confirming.',
        },
        {
          sub: '3.2 Wrong Recipient Transfer',
          text: 'If you transferred money to the wrong person, INRT Wallet cannot forcibly reverse the transaction. We will attempt to contact the recipient on your behalf to request voluntary return. However, we cannot guarantee recovery of such funds.',
        },
        {
          sub: '3.3 Failed Transfer',
          text: 'If a transfer fails and your wallet is debited, the amount will be automatically credited back to your wallet within 24 hours. If not resolved, contact support@inrtwallet.in.',
        },
      ],
    },
    {
      title: '4. Mobile Recharges',
      content: [
        {
          sub: '4.1 Successful Recharge',
          text: 'Successful mobile recharges are non-refundable. Once a recharge is processed and the operator confirms success, we cannot reverse it.',
        },
        {
          sub: '4.2 Failed Recharge',
          text: 'If a recharge fails (operator rejects or service unavailable) and your wallet was debited:\n• Automatic refund to your wallet within 24 hours\n• Most failed recharges are automatically reversed\n• If wallet is not credited within 24 hours, contact support',
        },
        {
          sub: '4.3 Pending Recharge',
          text: 'Some recharges may show "Processing" status. These are typically resolved within 2-4 hours. If pending for more than 4 hours, contact support with your Order ID.',
        },
        {
          sub: '4.4 Wrong Number Recharge',
          text: 'Recharges done to incorrect mobile numbers are non-refundable. Always verify the number before proceeding.',
        },
      ],
    },
    {
      title: '5. Bill Payments',
      content: [
        {
          sub: '5.1 Successful Bill Payment',
          text: 'Confirmed bill payments are non-refundable. Once the biller confirms receipt, the transaction is final.',
        },
        {
          sub: '5.2 Failed Bill Payment',
          text: 'If a bill payment fails and your wallet was debited, the amount will be automatically refunded to your wallet within 3-5 business days.',
        },
        {
          sub: '5.3 Overpayment',
          text: 'If you accidentally pay more than your bill amount, the excess may be adjusted in your next bill by the biller, depending on the biller\'s policy. INRT Wallet is not responsible for such adjustments.',
        },
      ],
    },
    {
      title: '6. INRT Token Transactions',
      content: [
        {
          sub: '6.1 INRT Purchases',
          text: 'INRT tokens purchased (converted from INR) are non-refundable. Since 1 INRT = ₹1 always, you can convert INRT back to INR balance at any time within the app.',
        },
        {
          sub: '6.2 INRT Transfers',
          text: 'INRT token transfers follow the same policy as wallet transfers — instant and non-reversible.',
        },
        {
          sub: '6.3 Cross-Border INRT Payments',
          text: 'Cross-border payments made using INRT are subject to additional processing steps. Failed cross-border transactions will be refunded to your INRT balance within 5-7 business days.',
        },
      ],
    },
    {
      title: '7. Cashback & Rewards',
      content: [
        {
          sub: '7.1 Earned Rewards',
          text: 'INRT reward points earned through transactions are non-refundable and non-transferable.',
        },
        {
          sub: '7.2 Reversal of Rewards',
          text: 'If a transaction for which rewards were earned is subsequently refunded, the associated reward points will be deducted from your account.',
        },
      ],
    },
    {
      title: '8. Refund Timelines Summary',
      content: [
        {
          sub: '8.1 Refund Timeline Table',
          text: 'Failed top-up (bank deducted):     3-5 business days\nFailed wallet transfer:            Within 24 hours\nFailed mobile recharge:            Within 24 hours\nFailed bill payment:               3-5 business days\nFailed cross-border INRT:          5-7 business days\nDisputed transaction:              7-15 business days\nAccount closure refund:            5-7 business days',
        },
      ],
    },
    {
      title: '9. How to Request a Refund',
      content: [
        {
          sub: '9.1 Automatic Refunds',
          text: 'Most failed transactions are automatically reversed. Check your transaction history before contacting support.',
        },
        {
          sub: '9.2 Manual Refund Request',
          text: 'To raise a refund request:\n1. Open INRT Wallet app → Transaction History\n2. Select the transaction\n3. Tap "Dispute" or "Report Issue"\n4. Describe the issue and submit\n\nAlternatively email: support@inrtwallet.in\nSubject: Refund Request - [Transaction ID]',
        },
        {
          sub: '9.3 Information Required',
          text: 'Please provide:\n• Registered mobile number\n• Transaction ID / Order ID\n• Transaction date and amount\n• Description of the issue\n• Bank statement screenshot (if bank was debited)',
        },
      ],
    },
    {
      title: '10. Dispute Resolution',
      content: [
        {
          sub: '10.1 Response Time',
          text: 'We acknowledge all refund requests within 24 hours and resolve them within the timelines mentioned above.',
        },
        {
          sub: '10.2 Escalation',
          text: 'If your refund is not processed within the stated timeline, escalate to:\nGrievance Officer: grievance@inrtwallet.in\nResponse: Within 30 days as per IT Act guidelines',
        },
        {
          sub: '10.3 Regulatory Escalation',
          text: 'If not satisfied with our resolution, you may escalate to:\n• RBI Ombudsman for Digital Transactions: cms.rbi.org.in\n• National Consumer Helpline: 1800-11-4000',
        },
      ],
    },
    {
      title: '11. Contact Us',
      content: [
        {
          sub: 'INRT Wallet Support',
          text: 'Email: support@inrtwallet.in\nWebsite: inrtwallet.in\nSupport Hours: Monday to Saturday, 10 AM to 6 PM IST\n\nFor urgent issues related to unauthorized transactions, contact us immediately.',
        },
      ],
    },
  ];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>←</button>
        <h1 style={S.headerTitle}>Refund Policy</h1>
      </div>

      <div style={S.body}>
        <div style={S.introCard}>
          <p style={S.introTitle}>💰 Refund & Cancellation Policy</p>
          <p style={S.introText}>
            This policy explains when and how refunds are processed for transactions made through INRT Wallet.
          </p>
          <p style={S.introText}>
            <strong style={{ color: '#fff' }}>Effective Date:</strong> {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 10 }}>
            {['Auto-refund on failures', 'No refund on successful P2P', '24hr resolution'].map(t => (
              <span key={t} style={{ background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 20, padding: '3px 10px', color: '#00C853', fontSize: 11, fontWeight: 600 }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Quick reference */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 16px', marginBottom: 12 }}>
          <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: '#FFD60A', margin: '0 0 14px' }}>⚡ Quick Reference</p>
          {[
            { type: 'Failed Top-Up',         refund: 'Yes — 3-5 days',    color: '#00C853' },
            { type: 'P2P Transfer (Success)', refund: 'No — Final',        color: '#FF3B30' },
            { type: 'Failed Recharge',        refund: 'Yes — 24 hours',    color: '#00C853' },
            { type: 'Failed Bill Payment',    refund: 'Yes — 3-5 days',    color: '#00C853' },
            { type: 'Wrong Recharge Number',  refund: 'No — Final',        color: '#FF3B30' },
            { type: 'INRT Purchases',         refund: 'Convert back anytime', color: '#FF9500' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{r.type}</span>
              <span style={{ color: r.color, fontSize: 12, fontWeight: 700 }}>{r.refund}</span>
            </div>
          ))}
        </div>

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

        <div style={S.footerCard}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', margin: 0, lineHeight: 1.7 }}>
            INRT Wallet reserves the right to modify this Refund Policy at any time.
            For the most current version, visit inrtwallet.in/refund-policy
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
  introCard:   { background: 'linear-gradient(135deg,rgba(0,200,83,0.08),rgba(0,229,204,0.08))', border: '1px solid rgba(0,200,83,0.15)', borderRadius: 18, padding: '20px 18px', marginBottom: 16 },
  introTitle:  { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 16, color: '#fff', margin: '0 0 10px' },
  introText:   { color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 8px', lineHeight: 1.7 },
  section:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 16px', marginBottom: 12 },
  sectionTitle:{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 15, color: '#00e5cc', margin: '0 0 14px' },
  item:        { marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' },
  itemSub:     { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 13, color: '#fff', margin: '0 0 6px' },
  itemText:    { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0, lineHeight: 1.8, whiteSpace: 'pre-line' as const },
  footerCard:  { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '16px', marginTop: 8 },
};
