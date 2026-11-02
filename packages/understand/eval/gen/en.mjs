// English templates (lang "en"), Cameroonian Anglophone usage.
const g = (k, a, o, t) => ({ lang: 'en', k, a, ...o, t });

export default [
  /* ===================== electricity_bill (12) ===================== */
  g('electricity_bill', 'pay', { due: 'u', from: 'ENEO' }, [
    (c) => `ENEO: Dear customer, your bill ${c.ref('INV-', 6)} of ${c.A(8000, 60000)} is ready. Kindly pay before ${c.D()} to avoid disconnection.`,
  ]),
  g('electricity_bill', 'pay', { due: 's', from: 'ENEO' }, [
    (c) => `ENEO Cameroon: Amount due ${c.A(5000, 45000)} for meter ${c.ref('', 9)}. Payment deadline: ${c.D()}. Pay with MTN MoMo or Orange Money.`,
  ]),
  g('electricity_bill', 'pay', { due: 'L', src: 'letter', from: 'ENEO' }, [
    (c) => `ENEO CAMEROON\nFINAL NOTICE\nMr/Mrs ${c.name()}\nYour electricity bill no. ${c.ref('', 8)} for ${c.A(15000, 90000)} was due on ${c.D()} and is still outstanding. Your supply may be cut off if the bill is not settled. Please report to the ${c.city()} office.`,
  ]),
  g('electricity_bill', 'nothing', { from: 'ENEO' }, [
    (c) => `ENEO: Your prepaid meter ${c.ref('', 11)} was recharged successfully. Amount ${c.A(2000, 20000, 1000)}, ${c.int(10, 120)} kWh credited. Ref ${c.ref('EN', 6)}.`,
  ]),
  g('electricity_bill', 'nothing', { from: 'ENEO' }, [
    (c) => `ENEO: There will be a planned power cut on ${c.D(c.int(2, 12))} from 8am to 4pm in ${c.quarter()} due to maintenance work. We apologise for the inconvenience.`,
  ]),
  g('electricity_bill', 'bring_document', { due: 's', from: 'ENEO' }, [
    (c) => `ENEO: To complete your new connection request, please bring a copy of your ID card and your land title to the ${c.city()} office before ${c.D()}.`,
  ]),
  g('electricity_bill', 'go_to_place', { due: 'u', from: 'ENEO' }, [
    (c) => `ENEO: Your meter replacement has been approved. Please come to the ${c.city()} agency on ${c.D()} at ${c.time()} with your ID.`,
  ]),
  g('electricity_bill', 'call', { from: 'ENEO' }, [
    (c) => `ENEO: For any complaint about your last bill, call customer service on ${c.land()}.`,
  ]),
  g('electricity_bill', 'collect', { from: 'ENEO' }, [
    (c) => `ENEO: Your clearance certificate is ready for collection at the ${c.city()} office. Come with your ID card.`,
  ]),
  g('electricity_bill', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `ENEO: Your light will be disconnected today. Send ${c.A(10000, 40000, 1000)} by MoMo to ${c.sn} immediately to settle your bill.`,
  ]),
  g('electricity_bill', 'pay', { due: 'u', sg: ['link'], from: 'ENEO' }, [
    (c) => `ENEO: Bill ${c.ref('INV-', 6)} is overdue. Pay online before ${c.D()}: ${c.url('eneo-pay.example', '/b/' + c.code(4))}`,
  ]),
  g('electricity_bill', 'reply', { src: 'whatsapp', due: 'u', from: 'name:Uncle Fon Sample' }, [
    (c) => `Evening. ENEO people came to read the meter and said the bill of ${c.A(10000, 30000, 1000)} must be settled before ${c.D()}. Reply to confirm if you can send it.`,
  ]),

  /* ===================== water_bill (11) ===================== */
  g('water_bill', 'pay', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Water bill no. ${c.ref('CW-', 5)}, consumption ${c.int(6, 40)} m3, amount ${c.A(3000, 25000)}. Please pay before ${c.D()}.`,
  ]),
  g('water_bill', 'pay', { due: 'u', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Dear customer, your water bill of ${c.A(4000, 30000)} is unpaid. Your connection will be cut off on ${c.D()} if payment is not made. Ref: ${c.ref('CW-', 5)}.`,
  ]),
  g('water_bill', 'pay', { due: 'L', src: 'letter', from: 'CAMWATER' }, [
    (c) => `CAMWATER - Commercial Department\nDEMAND NOTICE\nMr/Mrs ${c.name()}, contract no. ${c.ref('', 8)}\nYour bill of ${c.A(12000, 70000)} was due on ${c.D()}. Kindly settle the bill to avoid disconnection.`,
  ]),
  g('water_bill', 'nothing', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: We have received your payment of ${c.A(3000, 25000)} for bill ${c.ref('CW-', 5)}. Thank you for your payment.`,
  ]),
  g('water_bill', 'nothing', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: There will be no water supply on ${c.D(c.int(1, 10))} in ${c.quarter()} because of repairs on the main pipe. We thank you for your understanding.`,
  ]),
  g('water_bill', 'go_to_place', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Please come to the ${c.city()} agency before ${c.D()} to regularise your connection.`,
  ]),
  g('water_bill', 'bring_document', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: For your new water subscription, please bring a copy of your ID card, a site plan and the receipt for the meter before ${c.D()}.`,
  ]),
  g('water_bill', 'call', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: A leak was detected on your connection. For more information call customer service on ${c.land()}.`,
  ]),
  g('water_bill', 'collect', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: Your connection certificate is ready. You can collect it at the ${c.city()} agency.`,
  ]),
  g('water_bill', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'account_block_threat', 'time_pressure'], from: 'num' }, [
    (c) => `CAMWATER: Your bill is unpaid and your water will be cut within 24 hours. Send ${c.A(8000, 30000, 1000)} by Orange Money to ${c.ph()}.`,
  ]),
  g('water_bill', 'reply', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: To receive your bills by SMS, reply YES to this message before ${c.D()}.`,
  ]),

  /* ===================== mobile_money (22) ===================== */
  g('mobile_money', 'nothing', { from: 'MTN MoMo' }, [
    (c) => `You have received ${c.A(2000, 100000, 500)} from ${c.name()}. New balance: ${c.A(5000, 200000, 500)}. Transaction ID: ${c.ref('', 7)}. Never share your secret code with anyone.`,
  ]),
  g('mobile_money', 'nothing', { from: 'Orange Money' }, [
    (c) => `Orange Money: Withdrawal successful. Amount ${c.A(5000, 150000, 500)}, fee ${c.A(100, 1500, 100)}. New balance ${c.A(500, 90000, 500)}. ID ${c.ref('', 9)}. Orange will never ask for your PIN.`,
  ]),
  g('mobile_money', 'nothing', { from: 'MTN MoMo' }, [
    (c) => `Transfer successful. You sent ${c.A(1000, 80000, 500)} to ${c.name()} (${c.fmtPh(c.ph9())}). Fee: ${c.A(100, 1000, 100)}. New balance: ${c.A(500, 60000, 500)}. Do not share your PIN.`,
  ]),
  g('mobile_money', 'nothing', { from: 'Orange Money' }, [
    (c) => `Deposit successful: ${c.A(5000, 200000, 500)} has been added to your Orange Money account by agent ${c.fn()}. Transaction ${c.ref('', 8)}.`,
  ]),
  g('mobile_money', 'pay', { due: 'u', from: 'MTN MoMo' }, [
    (c) => `MTN MoMo: Your loan of ${c.A(5000, 50000, 1000)} is due on ${c.D()}. Please repay before this date to avoid penalties.`,
  ]),
  g('mobile_money', 'go_to_place', { due: 's', from: 'Orange Money' }, [
    (c) => `Orange Money: To raise the limit of your account, visit an Orange shop before ${c.D()}.`,
  ]),
  g('mobile_money', 'bring_document', { due: 's', from: 'MTN MoMo' }, [
    (c) => `MTN MoMo: Registration update required. Bring your ID card to any MoMo agent before ${c.D()} or your account limit will be reduced.`,
  ]),
  g('mobile_money', 'call', { from: 'Orange Money' }, [
    (c) => `Orange Money: For any complaint about transaction ${c.ref('', 8)}, call customer service from your Orange line.`,
  ]),
  g('mobile_money', 'pay', { src: 'whatsapp', sg: ['wrong_transfer'], from: 'num' }, [
    (c) => `Good evening, I sent you ${c.A(15000, 90000, 500)} by mistake, wrong number. Please send it back to ${c.sn}. God bless you.`,
  ]),
  g('mobile_money', 'pay', { sg: ['wrong_transfer', 'fake_balance', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: You have received ${c.A(50000, 150000, 5000)} from ${c.name()}. New balance: ${c.A(60000, 200000, 5000)}. This was sent in error, kindly return the money to ${c.sn}.`,
  ]),
  g('mobile_money', 'nothing', { sg: ['fake_balance', 'sender_mismatch'], from: 'num' }, [
    (c) => `You have received ${c.A(25000, 200000, 5000)} from ${c.name()}. New balance: ${c.A(100000, 300000, 5000)}. Transaction ID: ${c.ref('', 7)}. MTN MoMo.`,
  ]),
  g('mobile_money', 'reply', { sg: ['asks_pin', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: To reverse the wrong transaction of ${c.A(10000, 80000, 500)}, send your secret code to ${c.sn}.`,
  ]),
  g('mobile_money', 'reply', { u: 'urgent', sg: ['account_block_threat', 'time_pressure', 'asks_pin', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange Money: Your account will be blocked within 30 minutes. Reply with your PIN code to confirm your identity.`,
  ]),
  g('mobile_money', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `CONGRATULATIONS! You won ${c.A(500000, 3000000, 500000)} in the Orange Money lottery. To receive your prize, send ${c.A(5000, 25000, 5000)} as processing fee to ${c.sn}.`,
  ]),
  g('mobile_money', 'call', { src: 'whatsapp', sg: ['prize_fee', 'asks_to_call_number'], from: 'num' }, [
    (c) => `MTN MoMo: You are this week's lucky winner and a brand new phone is waiting for you! Call ${c.sn} to claim your prize.`,
  ]),
  g('mobile_money', 'pay', { sg: ['ussd_instruction', 'wrong_transfer'], lvl: 'likely_scam', from: 'num' }, [
    (c) => `Transfer error of ${c.A(20000, 70000, 5000)}. To cancel, dial *126*1*${c.ph9()}*${c.num(20000, 70000, 5000)}# now.`,
  ]),
  g('mobile_money', 'pay', { sg: ['pay_to_personal_number', 'account_block_threat', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: Your account is blocked. To unblock it, send ${c.A(3000, 15000, 1000)} activation fee to ${c.sn}.`,
  ]),
  g('mobile_money', 'unclear', { sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: your account needs verification. Click here: ${c.url('momo-verify.example', '/' + c.code(5))}`,
  ]),
  g('mobile_money', 'call', { u: 'urgent', sg: ['asks_to_call_number', 'time_pressure', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange Money: There is a problem with your account. Call ${c.sn} immediately, an agent will assist you.`,
  ]),
  g('mobile_money', 'reply', { src: 'whatsapp', sg: ['asks_pin'], from: 'num' }, [
    (c) => `Hello, this is MTN MoMo support. We are refunding ${c.A(20000, 60000, 5000)} to you. Please tell us the confirmation code you will receive by SMS.`,
  ]),
  g('mobile_money', 'unclear', { u: 'urgent', sg: ['time_pressure'], from: 'Orange Money' }, [
    (c) => `Orange Money: Your scheduled transfer expires today. Confirm in the app before midnight.`,
  ]),

  g('mobile_money', 'collect', { from: 'MTN MoMo' }, [
    (c) => `MTN MoMo: Your new MoMo card is ready. You can collect it at the ${c.city()} MTN shop with your ID card.`,
  ]),

  /* ===================== telecom (15) ===================== */
  g('telecom', 'pay', { due: 'u', from: 'MTN Cameroon' }, [
    (c) => `MTN: Your ${c.int(2, 30)}GB internet bundle expires on ${c.D()}. Recharge ${c.A(1000, 15000, 500)} to renew it.`,
  ]),
  g('telecom', 'nothing', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Your ${c.int(1, 20)}GB bundle has been activated successfully. Valid until ${c.D(c.int(5, 31))}. Thank you for choosing Orange.`,
  ]),
  g('telecom', 'nothing', { from: 'MTN Cameroon' }, [
    (c) => `MTN: Your recharge of ${c.A(500, 10000, 500)} was received. Your airtime balance is ${c.A(200, 15000, 100)}. Thank you.`,
  ]),
  g('telecom', 'pay', { due: 's', src: 'letter', from: 'name:CAMTEL' }, [
    (c) => `CAMTEL - ${c.city()} Agency\nLandline bill no. ${c.ref('', 8)}\nAmount: ${c.A(7000, 60000)}\nPayment deadline: ${c.D()}. After this date late fees will apply.`,
  ]),
  g('telecom', 'reply', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Get a 100% recharge bonus! Reply YES to this message to activate it.`,
  ]),
  g('telecom', 'go_to_place', { due: 's', from: 'MTN Cameroon' }, [
    (c) => `MTN: To complete SIM registration, please visit an MTN shop with your ID card before ${c.D()}.`,
  ]),
  g('telecom', 'bring_document', { due: 'u', from: 'name:Nexttel' }, [
    (c) => `Nexttel: Your line is not registered. Please bring a copy of your ID card to the ${c.city()} shop before ${c.D()}.`,
  ]),
  g('telecom', 'call', { from: 'Orange Cameroun' }, [
    (c) => `Orange: For more information about your bundle, call customer service on 8000 from your Orange line.`,
  ]),
  g('telecom', 'collect', { from: 'MTN Cameroon' }, [
    (c) => `MTN: Your replacement SIM card is ready. Please collect it at the ${c.city()} shop with your ID.`,
  ]),
  g('telecom', 'nothing', { sg: ['ussd_instruction'], from: 'Orange Cameroun' }, [
    (c) => `Orange: To check your data balance, dial #123#. Thank you for being an Orange customer.`,
  ]),
  g('telecom', 'call', { u: 'urgent', sg: ['account_block_threat', 'time_pressure', 'asks_to_call_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `URGENT: Your SIM card will be blocked within 24 hours. Call ${c.sn} to confirm your identity.`,
  ]),
  g('telecom', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN: You are the lucky winner of our draw, you win ${c.int(20, 100)}GB free data. To receive it, send ${c.A(1000, 5000, 500)} to ${c.sn}.`,
  ]),
  g('telecom', 'unclear', { sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange: Win 10GB free! Click here: ${c.url('orange-promo.example', '/g/' + c.code(4))}`,
  ]),
  g('telecom', 'pay', { u: 'urgent', sg: ['time_pressure'], from: 'MTN Cameroon' }, [
    (c) => `MTN: Special offer! Double your recharge today only. Recharge ${c.A(1000, 5000, 500)} right now.`,
  ]),

  g('telecom', 'nothing', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Your monthly internet subscription has been renewed automatically. Amount debited: ${c.A(2000, 10000, 500)}. Thank you for your loyalty.`,
  ]),

  /* ===================== bank (16) ===================== */
  g('bank', 'nothing', { from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: Transfer of ${c.A(50000, 900000, 5000)} credited to your account **${c.digits(4)}. Available balance: ${c.A(80000, 1500000, 5000)}.`,
  ]),
  g('bank', 'nothing', { from: 'UBA' }, [
    (c) => `UBA: ATM withdrawal of ${c.A(10000, 200000, 5000)} completed on ${c.D(-c.int(0, 2))} at ${c.city()}. Balance: ${c.A(5000, 800000, 1000)}.`,
  ]),
  g('bank', 'pay', { due: 'u', from: 'UBA' }, [
    (c) => `UBA: Your loan instalment of ${c.A(30000, 250000, 5000)} is due on ${c.D()}. Please fund your account.`,
  ]),
  g('bank', 'pay', { due: 'L', src: 'letter', from: 'name:Ecobank' }, [
    (c) => `ECOBANK - ${c.city()} Branch\nRe: account no. ${c.ref('', 10)} overdrawn\nYour account is overdrawn by ${c.A(20000, 300000, 5000)}. Kindly regularise before ${c.D()} to avoid further charges.`,
  ]),
  g('bank', 'collect', { from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: Your debit card is ready for collection at the ${c.city()} branch. Come with your ID card.`,
  ]),
  g('bank', 'bring_document', { due: 's', from: 'SGC' }, [
    (c) => `SGC: To finalise your loan file, please bring your last 3 payslips before ${c.D()}.`,
  ]),
  g('bank', 'go_to_place', { due: 'u', from: 'UBA' }, [
    (c) => `UBA: Your appointment with your account manager is on ${c.D()} at ${c.time()}, ${c.city()} branch.`,
  ]),
  g('bank', 'call', { from: 'SGC' }, [
    (c) => `SGC: To dispute the transaction of ${c.D(-c.int(1, 5))}, call customer care on ${c.land()}.`,
  ]),
  g('bank', 'reply', { from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: A card payment of ${c.A(5000, 150000, 1000)} was requested. Reply YES to confirm or NO to decline.`,
  ]),
  g('bank', 'nothing', { from: 'SGC' }, [
    (c) => `SGC: Transaction ${c.ref('', 8)} approved. Never share your PIN or password, even with a bank staff member.`,
  ]),
  g('bank', 'nothing', { from: 'UBA' }, [
    (c) => `UBA: Your account maintenance fee of ${c.A(500, 3000, 500)} was debited today.`,
  ]),
  g('bank', 'reply', { u: 'urgent', sg: ['account_block_threat', 'asks_pin', 'sender_mismatch'], from: 'num' }, [
    (c) => `Afriland: Your account will be blocked. Send your PIN and password in reply to reactivate it.`,
  ]),
  g('bank', 'unclear', { src: 'whatsapp', sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `UBA: Your card is about to expire. Update your details here: ${c.url('uba-secure.example', '/m/' + c.code(4))}`,
  ]),
  g('bank', 'call', { sg: ['asks_to_call_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `SGC: Suspicious transaction of ${c.A(50000, 400000, 5000)} detected on your account. Call your account manager on ${c.sn}.`,
  ]),
  g('bank', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Your loan of ${c.A(500000, 2000000, 500000)} is approved. Send ${c.A(10000, 40000, 5000)} as file fee to ${c.sn} for disbursement.`,
  ]),
  g('bank', 'go_to_place', { due: 's', sg: ['account_block_threat'], from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: Dormant account. Your account will be closed on ${c.D()} if there is no transaction. Please visit your branch.`,
  ]),

  /* ===================== health (12) ===================== */
  g('health', 'go_to_place', { due: 'u', from: 'name:Demo District Hospital' }, [
    (c) => `Demo District Hospital: Appointment confirmed for ${c.D()} at ${c.time()}, ${c.pick(['cardiology', 'paediatrics', 'maternity', 'eye clinic'])}. Please arrive 30 minutes early. Info: ${c.land()}.`,
  ]),
  g('health', 'collect', { from: 'name:Sample Diagnostic Lab' }, [
    (c) => `Sample Diagnostic Lab: Your test results (file ${c.ref('', 6)}) are ready. You can collect them at the lab between 7am and 5pm.`,
  ]),
  g('health', 'take_medicine', { src: 'letter', from: 'unk' }, [
    (c) => `PRESCRIPTION\nDr ${c.name()}\nAmoxicillin 500 mg: 1 capsule morning and evening for 7 days, after meals.\nParacetamol 1 g: 1 tablet if fever, maximum 3 times a day.`,
  ]),
  g('health', 'take_medicine', { from: 'name:Sample Pharmacy' }, [
    (c) => `Sample Pharmacy: Treatment reminder. Take 1 tablet of ${c.pick(['Metformin 500 mg', 'Amlodipine 5 mg'])} every morning with water. Do not stop without your doctor's advice.`,
  ]),
  g('health', 'take_medicine', { src: 'whatsapp', from: 'name:Dr Samuel Demo' }, [
    (c) => `Hello. For the malaria: take Coartem 4 tablets twice a day for 3 days with food. Drink plenty of water. Come back if the fever continues.`,
  ]),
  g('health', 'pay', { due: 'u', from: 'name:Test Medical Clinic' }, [
    (c) => `Test Medical Clinic: Your bill ${c.ref('', 6)} (consultation and tests) of ${c.A(10000, 150000, 500)} is due before ${c.D()}. Kindly pay at the cashier.`,
  ]),
  g('health', 'bring_document', { due: 's', from: 'name:Demo District Hospital' }, [
    (c) => `Demo District Hospital: For your antenatal visit on ${c.D()}, please bring your health booklet and the scan results.`,
  ]),
  g('health', 'call', { from: 'name:Demo Health Centre' }, [
    (c) => `Demo Health Centre: To reschedule your appointment, call ${c.land()} from Monday to Friday.`,
  ]),
  g('health', 'reply', { due: 'u', from: 'name:Demo District Hospital' }, [
    (c) => `Demo District Hospital: Reply 1 to confirm or 2 to cancel your appointment on ${c.D()}.`,
  ]),
  g('health', 'nothing', { from: 'name:Demo District Hospital' }, [
    (c) => `Demo District Hospital: Your payment of ${c.A(2000, 50000, 500)} has been received at the cashier (receipt ${c.ref('', 6)}). Thank you.`,
  ]),
  g('health', 'go_to_place', { u: 'urgent', src: 'whatsapp', from: 'num' }, [
    (c) => `Hello, this is the nurse on duty. Your brother was brought to the emergency ward tonight. Please come as soon as you can to the emergency department with his ID.`,
  ]),
  g('health', 'collect', { sg: ['link'], from: 'name:Sample Diagnostic Lab' }, [
    (c) => `Sample Diagnostic Lab: Your results are available at www.lab-sample.cm with the number ${c.ref('', 6)}.`,
  ]),

  /* ===================== school (13) ===================== */
  g('school', 'pay', { due: 's', from: 'name:Demo Bilingual Grammar School' }, [
    (c) => `Demo Bilingual Grammar School: Second instalment of school fees, ${c.A(25000, 120000, 5000)}, is due before ${c.D()}. Thank you, parents.`,
  ]),
  g('school', 'pay', { due: 'u', src: 'letter', from: 'name:Sample College' }, [
    (c) => `SAMPLE COLLEGE - Principal's Office\nFinal reminder to the parents of ${c.name()}: school fees of ${c.A(30000, 90000, 5000)} must be paid before ${c.D()}, otherwise the student will not be admitted to class.`,
  ]),
  g('school', 'go_to_place', { due: 'u', from: 'name:Government Primary School Demo' }, [
    (c) => `Government Primary School Demo: Parents' meeting on ${c.DW()} at ${c.time()}. Attendance is compulsory.`,
  ]),
  g('school', 'collect', { from: 'name:Demo Bilingual Grammar School' }, [
    (c) => `Demo Bilingual Grammar School: First term report cards are ready. Parents can collect them at the secretary's office.`,
  ]),
  g('school', 'bring_document', { due: 's', from: 'name:Demo Bilingual Grammar School' }, [
    (c) => `Demo Bilingual Grammar School: Registration for the 2026-2027 session. Bring the birth certificate, 4 passport photos and last year's report card before ${c.D()}.`,
  ]),
  g('school', 'call', { from: 'name:Sample College' }, [
    (c) => `Sample College: For information about the mock GCE exams, call the secretary on ${c.land()}.`,
  ]),
  g('school', 'reply', { due: 'u', from: 'name:Government Primary School Demo' }, [
    (c) => `Government Primary School Demo: Parents, reply YES to allow your child to join the field trip. Reply before ${c.D()}.`,
  ]),
  g('school', 'nothing', { from: 'name:Government Primary School Demo' }, [
    (c) => `Government Primary School Demo: Parents are informed that the school will be closed on ${c.D(c.int(3, 20))} for a public holiday. Classes resume the next day.`,
  ]),
  g('school', 'nothing', { from: 'name:Demo Bilingual Grammar School' }, [
    (c) => `Demo Bilingual Grammar School: First term results: ${c.fn()} has been promoted to the next class. Congratulations. School fees payment received, thank you.`,
  ]),
  g('school', 'bring_document', { src: 'whatsapp', due: 'u', from: 'name:Teacher Mercy Sample' }, [
    (c) => `Dear parents, the mock exam in Mathematics holds on ${c.D()}. Pupils should bring their calculator, ruler and the exam slip. Thank you.`,
  ]),
  g('school', 'go_to_place', { due: 's', src: 'letter', from: 'name:Sample College' }, [
    (c) => `SAMPLE COLLEGE\nInvitation: The parents of ${c.name()} are invited to the Prize Giving Day on ${c.D()} at ${c.time()} in the school hall.`,
  ]),
  g('school', 'collect', { sg: ['link'], from: 'name:Examination Board Demo' }, [
    (c) => `GCE results are out at www.exams-sample.cm. Use your candidate number ${c.ref('', 5)} to check.`,
  ]),
  g('school', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Excellence Scholarship 2026: you have won a scholarship of ${c.A(300000, 1000000, 100000)}. Send ${c.A(10000, 25000, 5000)} as file fee to ${c.sn} to receive it.`,
  ]),

  /* ===================== administrative (12) ===================== */
  g('administrative', 'collect', { from: 'name:DGSN' }, [
    (c) => `DGSN: Your national ID card no. ${c.ref('', 8)} is ready. Collect it at the ${c.city()} police station with your receipt.`,
  ]),
  g('administrative', 'collect', { from: 'name:Council' }, [
    (c) => `${c.city()} Council: Your birth certificate is ready. You can collect it at the civil status office.`,
  ]),
  g('administrative', 'go_to_place', { due: 'u', src: 'letter', from: 'name:Council' }, [
    (c) => `${c.city().toUpperCase()} COUNCIL\nSummons: Mr/Mrs ${c.name()} is invited to the civil status office on ${c.D()} at ${c.time()} for the marriage ceremony. Bring your identity documents.`,
  ]),
  g('administrative', 'bring_document', { due: 's', from: 'name:Divisional Office' }, [
    (c) => `Divisional Office: Passport file ${c.ref('', 6)}. Documents required: birth certificate, ID card, 2 photos, before ${c.D()}.`,
  ]),
  g('administrative', 'pay', { due: 's', src: 'letter', from: 'name:Tax Centre' }, [
    (c) => `${c.city().toUpperCase()} TAX CENTRE\nNotice: your business licence for 2026, amount ${c.A(30000, 250000, 5000)}, must be paid before ${c.D()}. A 10% penalty applies after this date.`,
  ]),
  g('administrative', 'call', { from: 'name:Divisional Office' }, [
    (c) => `Divisional Office: To follow up your file ${c.ref('', 6)}, call ${c.land()} during office hours.`,
  ]),
  g('administrative', 'reply', { from: 'name:Council' }, [
    (c) => `${c.city()} Council: For the household census, reply to this SMS with your quarter and the number of people living with you.`,
  ]),
  g('administrative', 'nothing', { from: 'name:DGSN' }, [
    (c) => `DGSN: Your ID card request no. ${c.ref('', 8)} has been recorded. No action is required for now.`,
  ]),
  g('administrative', 'bring_document', { due: 'u', src: 'letter', from: 'name:Senior Divisional Officer' }, [
    (c) => `OFFICE OF THE SENIOR DIVISIONAL OFFICER, ${c.city().toUpperCase()}\nYou are requested to submit before ${c.D()}: certified copy of birth certificate, residence certificate and 3 photos.`,
  ]),
  g('administrative', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `DGSN: Your ID card is blocked. Send ${c.A(10000, 30000, 5000)} to ${c.sn} (release fee) immediately to get it back.`,
  ]),
  g('administrative', 'unclear', { sg: ['link'], from: 'name:Council' }, [
    (c) => `${c.city()} Council: Recruitment test results are published: ${c.url('concours-sample.cm', '/r/' + c.code(4))}`,
  ]),
  g('administrative', 'go_to_place', { due: 's', from: 'name:ELECAM' }, [
    (c) => `ELECAM: Voter register update. Please come to the ${c.city()} office before ${c.D()} with your ID card.`,
  ]),

  /* ===================== legal (9) ===================== */
  g('legal', 'go_to_place', { due: 's', src: 'letter', from: 'name:High Court' }, [
    (c) => `HIGH COURT OF ${c.city().toUpperCase()}\nSUMMONS\nYou are summoned to appear before the court on ${c.D()} at ${c.time()}, court ${c.int(1, 6)}, suit no. ${c.ref('HC/', 5)}.`,
  ]),
  g('legal', 'go_to_place', { due: 'u', from: 'name:Police Station' }, [
    (c) => `${c.city()} Police Station: You are required to report on ${c.D()} at ${c.time()} for questioning. Come with your ID card.`,
  ]),
  g('legal', 'bring_document', { due: 's', from: 'name:Barrister Demo Chambers' }, [
    (c) => `Barrister Demo Chambers: Please bring the documents of your case (land title, plan, receipts) to our office before ${c.D()}.`,
  ]),
  g('legal', 'pay', { u: 'urgent', src: 'letter', from: 'name:Bailiff' }, [
    (c) => `BAILIFF'S OFFICE, ${c.name().toUpperCase()}\nDEMAND NOTICE: you are required to pay ${c.A(100000, 800000, 5000)} within seven days, failing which legal action will be taken.`,
  ]),
  g('legal', 'call', { from: 'name:Court Registry' }, [
    (c) => `Court Registry ${c.city()}: For case no. ${c.ref('HC/', 5)}, call the registrar on ${c.land()}.`,
  ]),
  g('legal', 'nothing', { from: 'name:Court Registry' }, [
    (c) => `Court Registry ${c.city()}: Judgment in suit no. ${c.ref('HC/', 5)} has been delivered. Your file is closed.`,
  ]),
  g('legal', 'collect', { from: 'name:Court Registry' }, [
    (c) => `Court Registry ${c.city()}: A copy of your judgment is ready. Collect it at the registry with your ID card.`,
  ]),
  g('legal', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `Gendarmerie: A complaint has been filed against you. To avoid arrest, send ${c.A(20000, 80000, 5000)} to ${c.sn} immediately.`,
  ]),
  g('legal', 'call', { u: 'urgent', sg: ['asks_to_call_number', 'time_pressure', 'sender_mismatch'], from: 'num' }, [
    (c) => `COURT: An arrest warrant has been issued against you. Call ${c.sn} immediately.`,
  ]),

  /* ===================== other (6) ===================== */
  g('other', 'unclear', { sg: ['link'], from: 'num', lvl: 'caution' }, [
    (c) => `Your parcel is waiting for you. Track it here: bit.ly/${c.pick(['3AbCdEf', '4XyZkLm', '3QrStUv'])}`,
  ]),
  g('other', 'unclear', { from: 'unk' }, [
    (c) => `Hello. Reminder about your pending file. Thank you.`,
  ]),
  g('other', 'reply', { src: 'whatsapp', from: 'name:Aunty Ruth Sample' }, [
    (c) => `Hi, are you still coming to the party on Saturday? Please reply so that I know how much food to order.`,
  ]),
  g('other', 'call', { src: 'whatsapp', from: 'num' }, [
    (c) => `Hello, I found a wallet with your ID card near the market. Call me back on ${c.sn}.`,
  ]),
  g('other', 'nothing', { from: 'name:Demo Company Ltd' }, [
    (c) => `Demo Company Ltd wishes you a happy new year and thanks you for your loyalty.`,
  ]),
  g('other', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Job offer: earn ${c.A(150000, 300000, 50000)} per week from home. Send ${c.A(5000, 15000, 5000)} for registration to ${c.sn}.`,
  ]),
];
