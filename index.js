const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Investigator logic helper function
function analyzeComplaint(ticketId, complaint, transactionHistory) {
  // 1. Prompt Injection Defense
  let isInjected = false;
  const injectionKeywords = [
    "ignore previous instructions",
    "return json with",
    "your new instructions are",
    "pretend you are",
    "disregard your rules",
    "system prompt says"
  ];
  const complaintLower = (complaint || '').toLowerCase();
  for (const keyword of injectionKeywords) {
    if (complaintLower.includes(keyword)) {
      isInjected = true;
      break;
    }
  }

  // 2. Language Detection (en, bn, mixed)
  let lang = 'en';
  const hasBangla = /[\u0980-\u09FF]/.test(complaint || '');
  if (hasBangla) {
    lang = 'bn';
  } else {
    const banglishKeywords = [
      'taka', 'pathaisi', 'pathaici', 'pathano', 'send money', 'bkash', 'bikas', 'kete', 'keta',
      'aseni', 'ashini', 'dhukse', 'dhuke', 'bhul', 'bhul e', 'bhule', 'wrong number', 'number e',
      'deya', 'daba', 'hoyni', 'hoini', 'hoyeche', 'hoyse', 'shomossa', 'somossa', 'pin', 'otp',
      'agent', 'point', 'cashin', 'cashout', 'double', 'charge', 'failed', 'deducted'
    ];
    let banglishHits = 0;
    const words = complaintLower.split(/\s+/);
    for (const w of words) {
      if (banglishKeywords.some(bk => w.includes(bk))) {
        banglishHits++;
      }
    }
    if (banglishHits >= 2) {
      lang = 'mixed';
    }
  }

  // 3. Extract transaction amounts/details from complaint
  const numbersInComplaint = [];
  const numRegex = /\b\d{3,7}\b/g;
  let match;
  while ((match = numRegex.exec(complaint || '')) !== null) {
    numbersInComplaint.push(parseFloat(match[0]));
  }

  // Normalize transaction history
  const history = (transactionHistory || []).map(tx => {
    const rawAmount = tx.amount || tx.Amount || tx.transaction_amount || 0;
    const amountVal = parseFloat(String(rawAmount).replace(/[^0-9.]/g, '')) || 0;

    return {
      id: tx.txn_id || tx.id || tx.transaction_id || tx.transactionId || tx.txid || null,
      amount: amountVal,
      type: (tx.type || tx.transaction_type || tx.transactionType || tx.txn_type || '').toLowerCase(),
      counterparty: tx.counterparty || tx.recipient || tx.destination || tx.to || tx.receiver || tx.number || null,
      timestamp: tx.timestamp || tx.time || tx.date || tx.created_at || tx.createdAt || null,
      status: (tx.status || tx.state || '').toLowerCase()
    };
  });

  // Find matching transactions based on amount
  const matchedTxns = history.filter(tx => numbersInComplaint.includes(tx.amount));

  // Determine Case Type
  let caseType = 'other';

  // Phishing Detection
  const hasPhishingKeywords = (
    complaintLower.includes('pin') ||
    complaintLower.includes('otp') ||
    complaintLower.includes('password') ||
    complaintLower.includes('credential') ||
    complaintLower.includes('pin') ||
    complaintLower.includes('otp') ||
    complaintLower.includes('পিন') ||
    complaintLower.includes('ওটিপি') ||
    complaintLower.includes('পাসওয়ার্ড')
  ) && (
      complaintLower.includes('call') ||
      complaintLower.includes('sms') ||
      complaintLower.includes('message') ||
      complaintLower.includes('asked') ||
      complaintLower.includes('pretend') ||
      complaintLower.includes('request') ||
      complaintLower.includes('fake') ||
      complaintLower.includes('fraud') ||
      complaintLower.includes('চাইছে') ||
      complaintLower.includes('ফোন') ||
      complaintLower.includes('মেসেজ')
    );

  // Duplicate Payment Detection
  const hasDuplicateKeywords = (
    complaintLower.includes('twice') ||
    complaintLower.includes('double') ||
    complaintLower.includes('duplicate') ||
    complaintLower.includes('two times') ||
    complaintLower.includes('dui bar') ||
    complaintLower.includes('duibar') ||
    complaintLower.includes('double charge') ||
    complaintLower.includes('charged twice') ||
    complaintLower.includes('debited twice') ||
    complaintLower.includes('দুইবার') ||
    complaintLower.includes('২ বার') ||
    complaintLower.includes('একই টাকা')
  );

  // Wrong Transfer Detection
  const hasWrongTransferKeywords = (
    complaintLower.includes('wrong number') ||
    complaintLower.includes('wrong recipient') ||
    complaintLower.includes('mistyped') ||
    complaintLower.includes('mistake number') ||
    complaintLower.includes('bhul number') ||
    complaintLower.includes('bhul sen') ||
    complaintLower.includes('bhul sent') ||
    complaintLower.includes('ভুল নম্বর') ||
    complaintLower.includes('ভুল নাম্বার') ||
    complaintLower.includes('ভুল নাম্বারে') ||
    complaintLower.includes('ভুল সেন্ড')
  );

  // Agent Cash In Detection
  const hasAgentCashInKeywords = (
    complaintLower.includes('agent cash in') ||
    complaintLower.includes('cash in') ||
    complaintLower.includes('deposit agent') ||
    complaintLower.includes('agent pathaise') ||
    complaintLower.includes('agent point') ||
    complaintLower.includes('ক্যাশ ইন') ||
    complaintLower.includes('এজেন্ট') ||
    (complaintLower.includes('agent') && (complaintLower.includes('deposit') || complaintLower.includes('cash') || complaintLower.includes('taka') || complaintLower.includes('money') || complaintLower.includes('balance') || complaintLower.includes('টাকা')))
  );

  // Merchant Settlement Detection
  const hasSettlementKeywords = (
    complaintLower.includes('settlement') ||
    complaintLower.includes('merchant payment') ||
    complaintLower.includes('settled') ||
    complaintLower.includes('delay') ||
    complaintLower.includes('settle') ||
    complaintLower.includes('মার্চেন্ট') ||
    complaintLower.includes('সেটেলমেন্ট')
  );

  // Payment Failed Detection
  const hasFailedKeywords = (
    complaintLower.includes('failed') ||
    complaintLower.includes('unsuccessful') ||
    complaintLower.includes('error') ||
    complaintLower.includes('declined') ||
    complaintLower.includes('not completed') ||
    complaintLower.includes('kete nise') ||
    complaintLower.includes('kete gese') ||
    complaintLower.includes('failed but money cut') ||
    complaintLower.includes('ব্যর্থ') ||
    complaintLower.includes('ফেইল') ||
    complaintLower.includes('টাকা কেটে')
  );

  // Refund Request Detection
  const hasRefundKeywords = (
    complaintLower.includes('refund') ||
    complaintLower.includes('return money') ||
    complaintLower.includes('cancel purchase') ||
    complaintLower.includes('refund request') ||
    complaintLower.includes('রিফান্ড') ||
    complaintLower.includes('টাকা ফেরত')
  );

  if (hasPhishingKeywords) {
    caseType = 'phishing_or_social_engineering';
  } else if (hasDuplicateKeywords) {
    caseType = 'duplicate_payment';
  } else if (hasWrongTransferKeywords) {
    caseType = 'wrong_transfer';
  } else if (hasAgentCashInKeywords) {
    caseType = 'agent_cash_in_issue';
  } else if (hasSettlementKeywords) {
    caseType = 'merchant_settlement_delay';
  } else if (hasFailedKeywords) {
    caseType = 'payment_failed';
  } else if (hasRefundKeywords) {
    caseType = 'refund_request';
  } else {
    caseType = 'other';
  }

  // If injection is the only content, case_type is 'other'
  const words = complaintLower.split(/\s+/).filter(Boolean);
  if (isInjected && words.length <= 15) {
    caseType = 'other';
  }

  // Initialize output fields
  let relevantTxnId = null;
  let evidenceVerdict = 'insufficient_data';
  let severity = 'low';
  let department = 'customer_support';
  let agentSummary = '';
  let recommendedNextAction = '';
  let customerReply = '';
  let humanReviewRequired = false;
  let confidence = 0.90;
  let reasonCodes = [];

  // If we have 2+ matching transactions and we cannot distinguish:
  if (matchedTxns.length >= 2 && caseType !== 'duplicate_payment') {
    evidenceVerdict = 'insufficient_data';
    relevantTxnId = null;
    reasonCodes.push('ambiguous_match');
  }

  // Case-specific logic
  if (caseType === 'phishing_or_social_engineering') {
    evidenceVerdict = 'insufficient_data';
    relevantTxnId = null;
    severity = 'critical';
    department = 'fraud_risk';
    agentSummary = 'Customer reported a suspicious phone call or SMS asking for security credentials (PIN/OTP).';
    recommendedNextAction = 'Escalate to fraud risk team, check for compromised account activity, and monitor for unauthorized logins.';
    reasonCodes = ['phishing', 'credential_protection', 'critical_escalation'];
    confidence = 0.95;

    if (lang === 'bn') {
      customerReply = 'তথ্যটি জানানোর জন্য ধন্যবাদ। নিশ্চিত থাকুন যে আমাদের টিম কখনোই আপনার পিন (PIN) বা ওটিপি (OTP) জানতে চাইবে না। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।';
    } else if (lang === 'mixed') {
      customerReply = 'Apnar information er jonno dhonnobad. Amader team kokhono apnar PIN ba OTP chaibe na. Please do not share your PIN or OTP with anyone.';
    } else {
      customerReply = 'Thank you for reporting this. Please be assured that our support team will never ask for your PIN, OTP, or password. Please do not share your PIN or OTP with anyone.';
    }
  }

  else if (caseType === 'duplicate_payment') {
    department = 'payments_ops';
    // Look for duplicate payments (same amount, same counterparty, within 10 minutes)
    let duplicateFound = false;
    let dupTx1 = null;
    let dupTx2 = null;

    for (let i = 0; i < history.length; i++) {
      for (let j = i + 1; j < history.length; j++) {
        const t1 = history[i];
        const t2 = history[j];
        if (t1.amount === t2.amount && t1.counterparty === t2.counterparty && t1.amount > 0) {
          const diffMs = Math.abs(new Date(t1.timestamp).getTime() - new Date(t2.timestamp).getTime());
          if (isNaN(diffMs) || diffMs <= 10 * 60 * 1000) {
            duplicateFound = true;
            const time1 = new Date(t1.timestamp).getTime();
            const time2 = new Date(t2.timestamp).getTime();
            if (!isNaN(time1) && !isNaN(time2)) {
              if (time2 >= time1) {
                dupTx1 = t1;
                dupTx2 = t2;
              } else {
                dupTx1 = t2;
                dupTx2 = t1;
              }
            } else {
              dupTx1 = t1;
              dupTx2 = t2;
            }
            break;
          }
        }
      }
      if (duplicateFound) break;
    }

    if (duplicateFound) {
      evidenceVerdict = 'consistent';
      relevantTxnId = dupTx2.id;
      severity = 'high';
      agentSummary = `Confirmed duplicate payment of ${dupTx2.amount} BDT to ${dupTx2.counterparty}. Two transactions were made within a short period.`;
      recommendedNextAction = 'Route to payments ops to initiate standard dispute process for duplicate charge verification.';
      reasonCodes = ['duplicate_payment', 'biller_verification_required', 'transaction_match'];
      confidence = 0.95;

      if (lang === 'bn') {
        customerReply = `আমরা একটি ডুপ্লিকেট লেনদেন সনাক্ত করেছি। অফিসিয়াল নিয়ম অনুযায়ী যেকোনো যোগ্য অর্থ ফেরত দেওয়ার ব্যবস্থা করা হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Amra duplicate payment detect korechi. Eligible amount ti standard procedure onujayi process kora hobe. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `We have detected a duplicate transaction. If eligible, the amount will be processed through standard procedures. Please do not share your PIN or OTP with anyone.`;
      }
    } else {
      const matchedSingle = matchedTxns[0];
      if (matchedSingle) {
        evidenceVerdict = 'inconsistent';
        relevantTxnId = matchedSingle.id;
        severity = 'medium';
        agentSummary = `Customer reported duplicate payment, but transaction history only contains one matching transaction of ${matchedSingle.amount} BDT.`;
        recommendedNextAction = 'Verify with backend ledger or payment gateway if any secondary transaction was attempted but not settled.';
        reasonCodes = ['evidence_inconsistent', 'duplicate_payment'];
        confidence = 0.85;

        if (lang === 'bn') {
          customerReply = `আমরা আপনার ইতিহাসে এই পরিমাণের একটি মাত্র লেনদেন পেয়েছি। আমাদের টিম এটি পর্যালোচনা করবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amra eii amount er ekti matro transaction peyechi. Amader team eiti check korbe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `We only found a single transaction matching this amount in your history. Our team will review and process as per policy. Please do not share your PIN or OTP with anyone.`;
        }
      } else {
        evidenceVerdict = 'insufficient_data';
        relevantTxnId = null;
        severity = 'low';
        agentSummary = 'Customer reported duplicate payment, but transaction history is empty or contains no matching amounts.';
        recommendedNextAction = 'Request customer to provide transaction details or transaction ID for further check.';
        reasonCodes = ['vague_complaint', 'needs_clarification'];
        confidence = 0.70;

        if (lang === 'bn') {
          customerReply = `আপনাকে সহায়তা করার জন্য আমাদের আরও তথ্যের প্রয়োজন। অনুগ্রহ করে লেনদেনের আইডি, পরিমাণ এবং আনুমানিক সময় প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amader aro details dorkar. Please transaction ID, amount, abong approximate time details amader janan. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `We need more details to help you. Please provide the transaction ID, amount, and approximate time of the transaction. Please do not share your PIN or OTP with anyone.`;
        }
      }
    }
  }

  else if (caseType === 'wrong_transfer') {
    department = 'dispute_resolution';

    if (matchedTxns.length === 1 && matchedTxns[0]) {
      const matchTx = matchedTxns[0];
      const recipient = matchTx.counterparty;
      const count = history.filter(tx => tx.counterparty === recipient).length;

      if (count >= 3 && recipient) {
        evidenceVerdict = 'inconsistent';
        relevantTxnId = matchTx.id;
        severity = 'medium';
        agentSummary = `Customer claims wrong transfer of ${matchTx.amount} BDT to ${recipient}, but history shows they transacted with this recipient ${count} times recently.`;
        recommendedNextAction = 'Review transfer details. Contact sender to verify if the recipient is indeed incorrect despite historical transactions.';
        reasonCodes = ['established_recipient_pattern', 'evidence_inconsistent', 'wrong_transfer'];
        confidence = 0.85;

        if (lang === 'bn') {
          customerReply = `আমরা লক্ষ্য করেছি যে আপনি ইতিপূর্বে এই নম্বরে একাধিকবার লেনদেন করেছেন। আমাদের টিম নীতি অনুযায়ী এটি পর্যালোচনা করবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amra dekhechi je apnii eii number e ageo send korechen. Amader team eiti policy onujayi review korbe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `We noticed that you have frequently transacted with this recipient. Our team will review and process as per policy. Please do not share your PIN or OTP with anyone.`;
        }
      } else {
        evidenceVerdict = 'consistent';
        relevantTxnId = matchTx.id;
        severity = matchTx.amount > 5000 ? 'high' : (matchTx.amount >= 1000 ? 'high' : 'low');
        agentSummary = `Confirmed wrong transfer of ${matchTx.amount} BDT to ${recipient || 'unknown'}. Evidence matches complaint.`;
        recommendedNextAction = 'Initiate standard wrong transfer hold protocol on recipient account and contact recipient for consent.';
        reasonCodes = ['transaction_match', 'wrong_transfer', 'dispute_initiated'];
        confidence = 0.95;

        if (lang === 'bn') {
          customerReply = `আমরা আপনার ভুল নম্বরে টাকা পাঠানোর অভিযোগটি পেয়েছি। অফিসিয়াল নিয়ম অনুযায়ী যেকোনো যোগ্য অর্থ ফেরত দেওয়ার ব্যবস্থা করা হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amra apnar wrong transfer complaint ti peyechi. Eligible amount ti official channel er madhhwome process kora hobe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `We have received your wrong transfer complaint. If eligible, the amount will be processed through standard procedures. Please do not share your PIN or OTP with anyone.`;
        }
      }
    } else if (matchedTxns.length >= 2) {
      evidenceVerdict = 'insufficient_data';
      relevantTxnId = null;
      severity = 'medium';
      agentSummary = `Customer reported wrong transfer, but multiple transactions match the amount.`;
      recommendedNextAction = 'Contact customer to clarify the exact recipient number and transaction ID.';
      reasonCodes.push('ambiguous_match', 'wrong_transfer');
      confidence = 0.65;

      if (lang === 'bn') {
        customerReply = `আমরা এই পরিমাণের একাধিক লেনদেন পেয়েছি। অনুগ্রহ করে লেনদেনের আইডি, সঠিক সময় বা প্রাপকের নম্বরটি দিয়ে আমাদের সহায়তা করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Amra multiple matching transactions peyechi. Amader transaction ID, exact time, ba recipient number pathan. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `We found multiple transactions matching your request. Please provide the transaction ID, exact time, or recipient number to help us verify. Please do not share your PIN or OTP with anyone.`;
      }
    } else {
      evidenceVerdict = 'insufficient_data';
      relevantTxnId = null;
      severity = 'low';
      agentSummary = 'Customer reported wrong transfer, but no transaction history matches the complaint details.';
      recommendedNextAction = 'Ask customer for transaction ID, amount, and recipient phone number.';
      reasonCodes = ['vague_complaint', 'needs_clarification'];
      confidence = 0.70;

      if (lang === 'bn') {
        customerReply = `আপনাকে সহায়তা করার জন্য আমাদের আরও তথ্যের প্রয়োজন। অনুগ্রহ করে লেনদেনের আইডি, পরিমাণ এবং আনুমানিক সময় প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Amader aro details dorkar. Please transaction ID, amount, abong approximate time details amader janan. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `We need more details to help you. Please provide the transaction ID, amount, and approximate time of the transaction. Please do not share your PIN or OTP with anyone.`;
      }
    }
  }

  else if (caseType === 'agent_cash_in_issue') {
    department = 'agent_operations';

    const matchTx = matchedTxns.find(tx => tx.type === 'cash_in' || tx.type === 'deposit') || matchedTxns[0];

    if (matchTx) {
      relevantTxnId = matchTx.id;
      if (matchTx.status === 'pending') {
        evidenceVerdict = 'consistent';
        severity = 'high';
        agentSummary = `Pending agent cash-in transaction of ${matchTx.amount} BDT found. ID: ${matchTx.id}.`;
        recommendedNextAction = 'Verify pending status with the agent terminal and push settlement once agent confirms deposit.';
        reasonCodes = ['agent_cash_in', 'pending_transaction', 'transaction_match'];
        confidence = 0.95;

        if (lang === 'bn') {
          customerReply = `আপনার ক্যাশ-ইন লেনদেনটি বর্তমানে প্রক্রিয়াধীন রয়েছে। অফিসিয়াল নিয়ম অনুযায়ী এটি দ্রুত সম্পন্ন করা হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Apnar cash-in transaction ti pending dekhachhe. Eiti druto solve kora hobe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `Your cash-in transaction is currently pending. If eligible, the amount will be processed through standard procedures shortly. Please do not share your PIN or OTP with anyone.`;
        }
      } else {
        evidenceVerdict = 'inconsistent';
        severity = matchTx.amount > 5000 ? 'high' : 'medium';
        agentSummary = `Agent cash-in of ${matchTx.amount} BDT has status 'completed' in history, but customer claims non-receipt.`;
        recommendedNextAction = 'Initiate investigation with agent outlet to confirm if cash was collected and ledger matches.';
        reasonCodes = ['agent_cash_in', 'evidence_inconsistent'];
        confidence = 0.85;

        if (lang === 'bn') {
          customerReply = `আমাদের রেকর্ড অনুযায়ী ক্যাশ-ইন লেনদেনটি সম্পন্ন হয়েছে। আমরা বিষয়টি তদন্ত করছি এবং নীতি অনুযায়ী ব্যবস্থা নেওয়া হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amader record onujayi cash-in completed. Amra eiti investigate korchi abong policy onujayi process kora hobe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `Our records show the cash-in transaction was completed. We will investigate the issue and our team will review and process as per policy. Please do not share your PIN or OTP with anyone.`;
        }
      }
    } else {
      evidenceVerdict = 'insufficient_data';
      relevantTxnId = null;
      severity = 'low';
      agentSummary = 'Customer reported agent cash-in issue, but no cash-in transaction matches in history.';
      recommendedNextAction = 'Ask customer for agent number, transaction date, and receipt copy.';
      reasonCodes = ['vague_complaint', 'needs_clarification'];
      confidence = 0.70;

      if (lang === 'bn') {
        customerReply = `আপনাকে সহায়তা করার জন্য আমাদের আরও তথ্যের প্রয়োজন। অনুগ্রহ করে লেনদেনের আইডি, পরিমাণ এবং আনুমানিক সময় প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Amader aro details dorkar. Please transaction ID, amount, abong approximate time details amader janan. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `We need more details to help you. Please provide the transaction ID, amount, and approximate time of the transaction. Please do not share your PIN or OTP with anyone.`;
      }
    }
  }

  else if (caseType === 'merchant_settlement_delay') {
    department = 'merchant_operations';

    const matchTx = matchedTxns[0];
    if (matchTx) {
      relevantTxnId = matchTx.id;
      if (matchTx.status === 'pending') {
        evidenceVerdict = 'consistent';
        severity = 'medium';
        agentSummary = `Merchant settlement delay for transaction ${matchTx.id} of ${matchTx.amount} BDT. Current status is pending.`;
        recommendedNextAction = 'Escalate to merchant operations to verify banking channel delay and manually clear settlement.';
        reasonCodes = ['merchant_settlement_delay', 'pending_transaction', 'transaction_match'];
        confidence = 0.95;

        if (lang === 'bn') {
          customerReply = `বিলম্বের জন্য আমরা দুঃখিত। মার্চেন্ট সেটেলমেন্টটি প্রক্রিয়াধীন রয়েছে এবং অফিসিয়াল নিয়ম অনুযায়ী সম্পন্ন হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Delay er jonno amra duhkhiro. Settlement ti pending dekhachhe ebong standard procedure onujayi process kora hobe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `We apologize for the delay. The merchant settlement is currently pending and will be completed through standard procedures. Please do not share your PIN or OTP with anyone.`;
        }
      } else {
        evidenceVerdict = 'inconsistent';
        severity = 'medium';
        agentSummary = `Merchant settlement reported delayed, but transaction ${matchTx.id} is already completed.`;
        recommendedNextAction = 'Verify if settlement was successfully pushed to bank. Provide customer with settlement transaction reference.';
        reasonCodes = ['merchant_settlement_delay', 'evidence_inconsistent'];
        confidence = 0.85;

        if (lang === 'bn') {
          customerReply = `আমাদের রেকর্ড অনুযায়ী মার্চেন্ট সেটেলমেন্ট সম্পন্ন হয়েছে। কোনো সমস্যা থাকলে আমাদের টিম এটি পর্যালোচনা করবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amader record onujayi settlement completed. Kono shomossa thakle amader team review korbe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `Our records show the settlement was completed. Our team will review and process as per policy. Please do not share your PIN or OTP with anyone.`;
        }
      }
    } else {
      evidenceVerdict = 'insufficient_data';
      relevantTxnId = null;
      severity = 'medium';
      agentSummary = 'Merchant settlement delay reported, but no matching transaction is found in history.';
      recommendedNextAction = 'Ask merchant for transaction reference number and merchant ID.';
      reasonCodes = ['merchant_settlement_delay', 'needs_clarification'];
      confidence = 0.70;

      if (lang === 'bn') {
        customerReply = `মার্চেন্ট সেটেলমেন্টের তথ্যের জন্য অনুগ্রহ করে সেটেলমেন্টের আইডি এবং মার্চেন্ট আইডি প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Settlement details check korar jonno settlement ID ebong merchant ID pathan. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `Please provide the merchant ID and settlement reference number for us to check. Please do not share your PIN or OTP with anyone.`;
      }
    }
  }

  else if (caseType === 'payment_failed') {
    department = 'payments_ops';

    const matchTx = matchedTxns.find(tx => tx.status === 'failed') || matchedTxns[0];
    if (matchTx) {
      relevantTxnId = matchTx.id;
      if (matchTx.status === 'failed') {
        evidenceVerdict = 'consistent';
        const hasDeductedWord = complaintLower.includes('cut') || complaintLower.includes('deduct') || complaintLower.includes('kete') || complaintLower.includes('কেটে');
        severity = (hasDeductedWord || matchTx.amount > 5000) ? 'high' : 'medium';
        agentSummary = `Failed payment transaction of ${matchTx.amount} BDT detected. Customer reported possible balance deduction.`;
        recommendedNextAction = 'Route to payments ops to verify if the bank/ledger was debited and initiate standard auto-reversal.';
        reasonCodes = ['payment_failed', 'potential_balance_deduction', 'transaction_match'];
        confidence = 0.95;

        if (lang === 'bn') {
          customerReply = `লেনদেনটি ব্যর্থ হওয়ার জন্য আমরা দুঃখিত। যেকোনো যোগ্য অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Failed transaction er jonno amra duhkhiro. Any eligible amount official channel er maddhome return kora hobe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `We apologize for the failed transaction. Any eligible amount will be returned through official channels within standard timelines. Please do not share your PIN or OTP with anyone.`;
        }
      } else {
        evidenceVerdict = 'inconsistent';
        severity = matchTx.amount > 5000 ? 'high' : 'medium';
        agentSummary = `Customer reported failed transaction, but status of transaction ${matchTx.id} is completed in history.`;
        recommendedNextAction = 'Verify completion status with the third-party gateway/acquirer and check for ledger mismatch.';
        reasonCodes = ['payment_failed', 'evidence_inconsistent'];
        confidence = 0.85;

        if (lang === 'bn') {
          customerReply = `আমাদের রেকর্ড অনুযায়ী এই লেনদেনটি সফলভাবে সম্পন্ন হয়েছে। আপনার কোনো জিজ্ঞাসা থাকলে আমাদের টিম সেটি পর্যালোচনা করবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
        } else if (lang === 'mixed') {
          customerReply = `Amader record onujayi transaction ti completed dekhachhe. Konoproborti review er jonno amader team eiti policy onujayi check korbe. Please do not share your PIN or OTP with anyone.`;
        } else {
          customerReply = `Our records show that this transaction was successfully completed. If you still have concerns, our team will review and process as per policy. Please do not share your PIN or OTP with anyone.`;
        }
      }
    } else {
      evidenceVerdict = 'insufficient_data';
      relevantTxnId = null;
      severity = 'low';
      agentSummary = 'Customer reported failed payment, but no matching transaction is found in history.';
      recommendedNextAction = 'Ask customer for exact transaction ID, date, and amount of the failed transaction.';
      reasonCodes = ['payment_failed', 'needs_clarification'];
      confidence = 0.70;

      if (lang === 'bn') {
        customerReply = `আপনাকে সহায়তা করার জন্য আমাদের আরও তথ্যের প্রয়োজন। অনুগ্রহ করে লেনদেনের আইডি, পরিমাণ এবং আনুমানিক সময় প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Amader aro details dorkar. Please transaction ID, amount, abong approximate time details amader janan. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `We need more details to help you. Please provide the transaction ID, amount, and approximate time of the transaction. Please do not share your PIN or OTP with anyone.`;
      }
    }
  }

  else if (caseType === 'refund_request') {
    const matchTx = matchedTxns[0];
    let amt = matchTx ? matchTx.amount : 0;
    if (!amt && numbersInComplaint[0]) {
      amt = numbersInComplaint[0];
    }

    const isLowSev = amt < 1000;
    department = isLowSev ? 'customer_support' : 'dispute_resolution';

    if (matchTx) {
      relevantTxnId = matchTx.id;
      evidenceVerdict = 'consistent';
      severity = amt > 5000 ? 'high' : (amt >= 1000 ? 'medium' : 'low');
      agentSummary = `Refund request for completed transaction ${matchTx.id} of ${matchTx.amount} BDT.`;
      recommendedNextAction = isLowSev
        ? 'Guide customer on merchant refund policies and handle as standard support ticket.'
        : 'Escalate to dispute resolution to verify customer dispute and initiate merchant chargeback/investigation.';
      reasonCodes = ['refund_request', 'transaction_match', 'merchant_policy_dependent'];
      confidence = 0.95;

      if (lang === 'bn') {
        customerReply = `রিফান্ডের জন্য অনুগ্রহ করে সরাসরি মার্চেন্টের সাথে যোগাযোগ করুন। অফিসিয়াল নিয়ম অনুযায়ী যোগ্য অর্থ ফেরত দেওয়ার ব্যবস্থা করা হবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Refund er jonno merchant er sathe contact korun. Eligible amount ti standard procedure onujayi process kora hobe. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `For refunds, please contact the merchant directly as per their policy. If eligible, the amount will be processed through standard procedures. Please do not share your PIN or OTP with anyone.`;
      }
    } else {
      evidenceVerdict = 'insufficient_data';
      relevantTxnId = null;
      severity = 'low';
      agentSummary = 'Customer requested refund, but no transaction history matches the complaint details.';
      recommendedNextAction = 'Ask customer for transaction ID, date, and amount of the purchase.';
      reasonCodes = ['refund_request', 'needs_clarification'];
      confidence = 0.70;

      if (lang === 'bn') {
        customerReply = `আপনাকে সহায়তা করার জন্য আমাদের আরও তথ্যের প্রয়োজন। অনুগ্রহ করে লেনদেনের আইডি, পরিমাণ এবং আনুমানিক সময় প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
      } else if (lang === 'mixed') {
        customerReply = `Amader aro details dorkar. Please transaction ID, amount, abong approximate time details amader janan. Please do not share your PIN or OTP with anyone.`;
      } else {
        customerReply = `We need more details to help you. Please provide the transaction ID, amount, and approximate time of the transaction. Please do not share your PIN or OTP with anyone.`;
      }
    }
  }

  else {
    evidenceVerdict = 'insufficient_data';
    relevantTxnId = null;
    severity = 'low';
    department = 'customer_support';
    agentSummary = 'Vague customer complaint or inquiry requiring more details to categorize and investigate.';
    recommendedNextAction = 'Request customer to provide specific details including transaction ID, amount, and recipient details.';
    reasonCodes = ['vague_complaint', 'needs_clarification'];
    confidence = 0.60;

    if (lang === 'bn') {
      customerReply = `আপনাকে সহায়তা করার জন্য আমাদের আরও তথ্যের প্রয়োজন। অনুগ্রহ করে লেনদেনের আইডি, পরিমাণ এবং আনুমানিক সময় প্রদান করুন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
    } else if (lang === 'mixed') {
      customerReply = `Amader aro details dorkar. Please transaction ID, amount, abong approximate time details amader janan. Please do not share your PIN or OTP with anyone.`;
    } else {
      customerReply = `We need more details to help you. Please provide the transaction ID, amount, and approximate time of the transaction. Please do not share your PIN or OTP with anyone.`;
    }
  }

  // Determine human_review_required
  const hasPendingAgentCashIn = (caseType === 'agent_cash_in_issue' && evidenceVerdict === 'consistent' && matchedTxns.some(tx => tx.status === 'pending'));
  const isContradiction = (evidenceVerdict === 'inconsistent');
  const isHighOrCritical = (severity === 'high' || severity === 'critical');
  const isOver5000 = numbersInComplaint.some(n => n > 5000) || (matchedTxns.some(tx => tx.amount > 5000));
  const isSpecialCaseType = (caseType === 'wrong_transfer' || caseType === 'phishing_or_social_engineering' || caseType === 'duplicate_payment');

  if (isSpecialCaseType || isContradiction || isHighOrCritical || isOver5000 || hasPendingAgentCashIn) {
    humanReviewRequired = true;
  } else {
    humanReviewRequired = false;
  }

  // Override manual review rules
  if (caseType === 'merchant_settlement_delay' && evidenceVerdict === 'consistent') {
    humanReviewRequired = false;
  }
  if (caseType === 'payment_failed' && evidenceVerdict === 'consistent' && severity !== 'high') {
    humanReviewRequired = false;
  }

  // Clean customer reply and next action from forbidden phrases
  let cleanReply = customerReply;
  const forbiddenReplacements = [
    { regex: /we will refund you/gi, safe: 'any eligible amount will be returned through official channels' },
    { regex: /your money will be returned/gi, safe: 'if eligible, the amount will be processed through standard procedures' },
    { regex: /we will reverse the transaction/gi, safe: 'our team will review and process as per policy' },
    { regex: /your account will be unblocked/gi, safe: 'if eligible, the account status will be reviewed and processed as per policy' }
  ];

  forbiddenReplacements.forEach(r => {
    cleanReply = cleanReply.replace(r.regex, r.safe);
    recommendedNextAction = recommendedNextAction.replace(r.regex, r.safe);
  });

  // Ensure security reminder is present
  const securityReminderEn = "Please do not share your PIN or OTP with anyone.";
  const securityReminderBn = "অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।";

  if (lang === 'bn') {
    if (!cleanReply.includes('পিন') && !cleanReply.includes('ওটিপি')) {
      cleanReply += ' ' + securityReminderBn;
    }
  } else {
    if (!cleanReply.toLowerCase().includes('pin') && !cleanReply.toLowerCase().includes('otp')) {
      cleanReply += ' ' + securityReminderEn;
    }
  }

  return {
    ticket_id: ticketId || "TKT-UNKNOWN",
    relevant_transaction_id: relevantTxnId,
    evidence_verdict: evidenceVerdict,
    case_type: caseType,
    severity: severity,
    department: department,
    agent_summary: agentSummary,
    recommended_next_action: recommendedNextAction,
    customer_reply: cleanReply,
    human_review_required: humanReviewRequired,
    confidence: parseFloat(confidence.toFixed(2)),
    reason_codes: reasonCodes.length > 0 ? reasonCodes : ['other']
  };
}

// Handlers for POST requests
const handleRequest = (req, res) => {
  const { ticket_id, complaint, transaction_history } = req.body;

  try {
    const result = analyzeComplaint(ticket_id, complaint, transaction_history);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Expose multiple endpoints for compatibility
app.post('/', handleRequest);
app.post('/analyze', handleRequest);
app.post('/investigate', handleRequest);
app.post('/api/analyze', handleRequest);
app.post('/api/investigate', handleRequest);
app.post('/api/v1/analyze', handleRequest);
app.post('/api/v1/investigate', handleRequest);

app.listen(PORT, () => {
  console.log(`QueueStorm Investigator server is running on port ${PORT}`);
});

module.exports = app;
