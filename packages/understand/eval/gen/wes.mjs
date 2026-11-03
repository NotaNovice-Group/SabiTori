// Cameroonian Pidgin English (lang "wes"), written as in everyday SMS/WhatsApp.
// SYNTHETIC: wording must be reviewed by native speakers before any use beyond smoke tests.
const g = (k, a, o, t) => ({ lang: 'wes', k, a, ...o, t });

export default [
  /* electricity_bill (4) */
  g('electricity_bill', 'pay', { src: 'whatsapp', due: 'u', from: 'name:Sista Brenda Fictif' }, [
    (c) => `Ma sista, ENEO man don kam. Di bill na ${c.A(8000, 40000, 1000)}, e must pay before ${c.D()} or dem go cut light. Abeg send di money.`,
  ]),
  g('electricity_bill', 'pay', { src: 'whatsapp', due: 's', from: 'name:Landlord Ebenezer Demo' }, [
    (c) => `Good evening. Na landlord. Di ENEO bill for di house na ${c.A(20000, 60000, 1000)}. Every tenant go pay ${c.A(3000, 10000, 500)} before ${c.D()}.`,
  ]),
  g('electricity_bill', 'nothing', { src: 'whatsapp', from: 'name:Papa Samuel Test' }, [
    (c) => `Na so e be. I don pay di ENEO bill finish, no wahala. Di light go come back tomorrow.`,
  ]),
  g('electricity_bill', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `ENEO: Yu light go cut today. Abeg send ${c.A(10000, 40000, 1000)} for MoMo to ${c.sn} before 5pm make dem no cut am.`,
  ]),

  /* water_bill (5) */
  g('water_bill', 'nothing', { src: 'whatsapp', from: 'name:Mami Esther Sample' }, [
    (c) => `Wuna, CAMWATER say water no go dey for ${c.quarter()} from ${c.D(c.int(1, 6))}. Make una fill di container dem.`,
  ]),
  g('water_bill', 'pay', { src: 'whatsapp', due: 'u', from: 'name:Mami Esther Sample' }, [
    (c) => `Ma pikin, di water bill na ${c.A(4000, 20000, 500)}. CAMWATER say pay before ${c.D()} or dem go cut am. Abeg find di money.`,
  ]),
  g('water_bill', 'go_to_place', { src: 'whatsapp', due: 's', from: 'name:Papa Samuel Test' }, [
    (c) => `Papa say make you go CAMWATER office for ${c.city()} before ${c.D()} for di meter palava.`,
  ]),
  g('water_bill', 'call', { src: 'whatsapp', from: 'name:Neighbour Fatima Demo' }, [
    (c) => `CAMWATER agent call me say di pipe dey leak for yu side. Call dem for ${c.land()} make dem tell you wetin dey happen.`,
  ]),
  g('water_bill', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'account_block_threat', 'time_pressure'], from: 'num' }, [
    (c) => `CAMWATER: Yu bill never pay. Send ${c.A(8000, 30000, 1000)} to ${c.sn} bifor 5pm or dem go cut yu water.`,
  ]),

  /* mobile_money (9) */
  g('mobile_money', 'pay', { sg: ['wrong_transfer'], from: 'num' }, [
    (c) => `Ma broda, I don send you ${c.A(15000, 90000, 500)} by mistake, abeg send am back for dis number ${c.sn}. God go bless you.`,
  ]),
  g('mobile_money', 'pay', { sg: ['wrong_transfer'], from: 'num' }, [
    (c) => `Sista abeg, I don mistake send ${c.A(10000, 60000, 500)} give you. Return am for ${c.sn}, I beg.`,
  ]),
  g('telecom', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [ // imitates an MTN promotion: telecom, like the fr/en prize-draw scams
    (c) => `Congrats! You don win ${c.A(500000, 3000000, 500000)} for MTN promo. Make you send ${c.A(5000, 20000, 5000)} for transport fee to ${c.sn} so dem go send am give you.`,
  ]),
  g('mobile_money', 'reply', { sg: ['asks_pin', 'account_block_threat', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: Abeg send yu secret code make we confirm yu account, if no so e go block.`,
  ]),
  g('mobile_money', 'pay', { sg: ['ussd_instruction', 'wrong_transfer'], lvl: 'likely_scam', from: 'num' }, [
    (c) => `Abeg dial *126*1*${c.ph9()}*${c.num(10000, 50000, 5000)}# make you cancel di wrong money wey I send.`,
  ]),
  g('mobile_money', 'nothing', { sg: ['fake_balance', 'sender_mismatch'], from: 'num' }, [
    (c) => `You don receive ${c.A(25000, 200000, 5000)} from ${c.name()}. New balance ${c.A(100000, 300000, 5000)}. Transaction ID ${c.ref('', 7)}. MTN MoMo.`,
  ]),
  g('mobile_money', 'nothing', { src: 'whatsapp', from: 'name:Mami Esther Sample' }, [
    (c) => `Ma pikin, I don send you ${c.A(5000, 30000, 500)} for MoMo. Check yu phone for see am.`,
  ]),
  g('mobile_money', 'pay', { src: 'whatsapp', due: 'u', from: 'name:Agent Clovis Demo' }, [
    (c) => `Ma broda, yu MoMo loan na ${c.A(5000, 30000, 1000)}. E go finish ${c.D()}. Abeg pay am.`,
  ]),
  g('mobile_money', 'go_to_place', { src: 'whatsapp', due: 's', from: 'name:Agent Clovis Demo' }, [
    (c) => `MoMo agent say make you go him shop for ${c.quarter()} for update yu KYC with yu ID card before ${c.D()}.`,
  ]),

  /* telecom (7) */
  g('telecom', 'pay', { src: 'whatsapp', due: 'u', from: 'name:Ma broda Patrice Fictif' }, [
    (c) => `Ma broda, yu MTN line go expire ${c.D()} if yu no recharge. Put ${c.A(1000, 5000, 500)} credit.`,
  ]),
  g('telecom', 'nothing', { src: 'whatsapp', from: 'name:Ma broda Patrice Fictif' }, [
    (c) => `Data don finish for my phone but I don buy new one. E don work now.`,
  ]),
  g('telecom', 'nothing', { from: 'MTN Cameroon' }, [ // a genuine opt-in promotion: nothing owed
    (c) => `MTN: You don win bonus 100%. Reply YES make we activate am.`,
  ]),
  g('telecom', 'go_to_place', { src: 'whatsapp', due: 's', from: 'name:Sista Brenda Fictif' }, [
    (c) => `Dem say make you go Orange shop for ${c.city()} with yu ID card before ${c.D()} for register yu SIM.`,
  ]),
  g('telecom', 'call', { u: 'urgent', sg: ['account_block_threat', 'time_pressure', 'asks_to_call_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Yu SIM go block for 24 hours. Call ${c.sn} now make you confirm yu ID.`,
  ]),
  g('telecom', 'unclear', { sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `Yu don win 10GB free data! Click here: ${c.url('orange-promo.example', '/g/' + c.code(4))}`,
  ]),
  g('telecom', 'collect', { src: 'whatsapp', from: 'name:Sista Brenda Fictif' }, [
    (c) => `Yu new SIM don ready. Go collect am for MTN shop for ${c.city()} with yu ID.`,
  ]),

  /* bank (6) */
  g('bank', 'nothing', { src: 'whatsapp', from: 'name:Mami Esther Sample' }, [
    (c) => `Ma pikin, I don put ${c.A(20000, 100000, 5000)} for yu UBA account. Go check am for ATM.`,
  ]),
  g('bank', 'pay', { src: 'whatsapp', due: 'u', from: 'name:Papa Samuel Test' }, [
    (c) => `Brother, yu bank loan instalment na ${c.A(30000, 120000, 5000)}, e don reach ${c.D()}. Abeg put money for yu account.`,
  ]),
  g('bank', 'go_to_place', { src: 'whatsapp', due: 'u', from: 'name:Sista Brenda Fictif' }, [
    (c) => `Di banker say make you kam ${c.city()} branch ${c.D()} for ${c.time()} for sign di papers.`,
  ]),
  g('bank', 'reply', { sg: ['asks_pin', 'account_block_threat', 'sender_mismatch'], from: 'num' }, [
    (c) => `UBA: Abeg send yu PIN and password make we open yu account again, e don block.`,
  ]),
  g('bank', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Yu loan ${c.A(500000, 2000000, 500000)} don approve. Send ${c.A(10000, 30000, 5000)} for file fee to ${c.sn} so dem go put am for yu account.`,
  ]),
  g('bank', 'bring_document', { src: 'whatsapp', due: 's', from: 'name:Papa Samuel Test' }, [
    (c) => `Bank say make you bring yu pay slip and yu ID card for ${c.city()} branch before ${c.D()}.`,
  ]),

  /* health (4) */
  g('health', 'take_medicine', { src: 'whatsapp', from: 'name:Dr Paul Fictif' }, [
    (c) => `Doctor say take di white tablet two times for day, morning and night, for 5 days. Take am after chop.`,
  ]),
  g('health', 'take_medicine', { src: 'whatsapp', from: 'name:Nurse Ruth Demo' }, [
    (c) => `Di pikin go drink di syrup 5 ml three times for day. No stop am even if e don well.`,
  ]),
  g('health', 'take_medicine', { src: 'whatsapp', from: 'name:Nurse Ruth Demo' }, [
    (c) => `Take Coartem 4 tablet for morning and 4 for night, three days. Drink plenty water.`,
  ]),
  g('health', 'go_to_place', { src: 'whatsapp', due: 'u', from: 'name:Sista Brenda Fictif' }, [
    (c) => `Doctor say make you kam hospital ${c.D()} for ${c.time()} for see di result.`,
  ]),

  /* school (4) */
  g('school', 'go_to_place', { src: 'whatsapp', due: 'u', from: 'name:Teacher Mercy Sample' }, [
    (c) => `Parents, meeting for school go be ${c.DW()} for ${c.time()}. Make una kam, e dey important.`,
  ]),
  g('school', 'pay', { src: 'whatsapp', due: 's', from: 'name:Headmaster Awah Test' }, [
    (c) => `Headmaster say school fees ${c.A(15000, 60000, 5000)} must pay before ${c.D()}. Any pikin wey no pay no go write exam.`,
  ]),
  g('school', 'bring_document', { src: 'whatsapp', due: 'u', from: 'name:Teacher Mercy Sample' }, [
    (c) => `Ma pikin, bring yu uniform and yu birth certificate for school ${c.D()}.`,
  ]),
  g('school', 'nothing', { src: 'whatsapp', from: 'name:Teacher Mercy Sample' }, [
    (c) => `School go close ${c.D(c.int(3, 20))} for holiday. Una pikin go resume Monday.`,
  ]),

  /* administrative (4) */
  g('administrative', 'collect', { src: 'whatsapp', from: 'name:Papa Samuel Test' }, [
    (c) => `Yu ID card don ready for police station for ${c.city()}. Go collect am with yu receipt.`,
  ]),
  g('administrative', 'go_to_place', { src: 'whatsapp', due: 's', from: 'name:Sista Brenda Fictif' }, [
    (c) => `Council say make you go civil status office ${c.D()} for yu marriage paper.`,
  ]),
  g('administrative', 'bring_document', { src: 'whatsapp', due: 's', from: 'name:Papa Samuel Test' }, [
    (c) => `Dem say make you bring birth certificate and 2 photo for ${c.city()} divisional office before ${c.D()}.`,
  ]),
  g('administrative', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `DGSN: Yu ID card block. Send ${c.A(10000, 30000, 5000)} to ${c.sn} for unblock am.`,
  ]),

  /* legal (2) */
  g('legal', 'go_to_place', { src: 'whatsapp', due: 'u', from: 'name:Papa Samuel Test' }, [
    (c) => `Police station for ${c.city()} say make you kam ${c.D()} for ${c.time()}. Bring yu ID card.`,
  ]),
  g('legal', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Gendarmerie say yu get case. Send ${c.A(20000, 80000, 5000)} to ${c.sn} for avoid prison.`,
  ]),

  /* other (3) */
  g('other', 'reply', { src: 'whatsapp', from: 'name:Ma friend Fatima Demo' }, [
    (c) => `Ma broda, yu dey come party Saturday? Reply me abeg.`,
  ]),
  g('other', 'unclear', { sg: ['link'], from: 'num', lvl: 'caution' }, [
    (c) => `Yu parcel don reach. Track am here: bit.ly/${c.pick(['3AbCdEf', '4XyZkLm', '3QrStUv'])}`,
  ]),
  g('other', 'call', { src: 'whatsapp', from: 'num' }, [
    (c) => `Ma friend, I see yu wallet for market. Call me for ${c.sn}.`,
  ]),
];
