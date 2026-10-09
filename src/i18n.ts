import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const ja = {
  app: 'PurpleLog',
  nav: { home: 'ホーム', timeline: '記録', chart: '経過', meds: '投薬・検査', report: 'レポート', settings: '設定', dev: '開発者' },
  btn: { seizureStart: '発作が始まった', unusual: 'いつもと違う', save: '保存', cancel: 'キャンセル', delete: '削除', add: '追加', print: '印刷 / PDF', later: '後から記録する', back: '戻る' },
  home: {
    thisMonth: '今月の発作', vsPrev: '前月比', sinceLast: '最終発作から', days: '日', times: '回', last30: '直近30日', nextCheck: '次回測定の目安', recent: '直近のできごと',
    noSeizure: '記録なし', guidance: '目安であり指示ではありません', monthlyOnly: '（月次記録のみ）',
  },
  seizure: {
    title: '発作記録', tapStart: 'タップで開始', recording: '記録中', videoOn: '録画中', ended: '発作が終わった', tapEnd: 'タップで終了・録画停止', rescue: '救急薬を使った（時刻を記録）',
    fiveMin: '5分を超えました。主治医の指示に従ってください', screenNote: '画面は消えません。ほかのアプリに切り替えると録画が止まります', videoOpt: '録画オプション', on: 'オン', off: 'オフ', cameraStart: '開始と同時にカメラが起動します',
  },
  event: {
    title: 'できごとの詳細', kind: '種別', seizure: '発作', unusual: 'いつもと違う', other: 'その他', start: '開始', end: '終了', duration: '持続', count: '回数', type: '発作の型', consciousness: '意識', recovery: '回復まで（分）', aura: '前兆', rescue: '救急薬', note: 'メモ', video: '動画', weather: 'この時刻の気象（自動）', fetchWeather: '気象を取得', noGrid: '設定で地域を登録すると気象を取得できます',
    types: { generalized_tonic_clonic: '全身がかたまり けいれん', focal: '体の一部だけ', focal_behavioral: 'ぼんやり・よだれ', focal_to_generalized: '一部から全身へ', unknown: 'わからない' },
    cons: { lost: 'なかった', kept: 'あった', unknown: 'わからない' },
    items: { mania: '躁状態', pica: '誤食', elimination: '排泄異常', ataxia: 'ふらつき', weakness: '足の力がない', lethargy: '元気がない', appetite_down: '食欲の低下', appetite_up: '食欲の増加', weight: '体重の変化', skin: '皮膚・被毛の変化', pacing: '徘徊', vomiting: '嘔吐', hyperactive: 'ハイテンション', eye_twitch: '目の症状', urination: '排尿の異常', other: 'その他' },
    estimated: '推定', timeUnknown: '時刻不明',
  },
  timeline: { title: 'タイムライン', cluster: '群発エピソード', seizures: '回', hours: '時間', doseChange: '投薬変更', doseLog: '投薬', prnLog: '頓服', lab: '検査', weight: '体重', unusualNear: 'この検査の前後30日の「いつもと違う日」', none: 'なし', monthly: '月次記録（日付なし）', showDoses: '投薬の記録を表示' },
  meds: {
    title: '投薬と検査', current: '現在の投薬', history: '変更履歴', change: '変更する', labs: '血中濃度・検査', addLab: '検査を記録する', analyte: '項目', value: '値', unit: '単位', date: '採血日時', lastDose: '最終投与', hoursSince: '時間前', timing: 'タイミング',
    trough: '次回投与前（トラフ）', post_dose: '投与後', not_applicable: '（タイミング不問）', unknown: '不明', sameAsPrev: '前回と一致', diffFromPrev: '前回と採血タイミングが異なります',
    troughNote: '抗てんかん薬の血中濃度は、毎回同じタイミング（次の投薬直前）で採血した値で比較します',
    ref: '基準', noWarn: '基準範囲はこの検査機関の値。低くても警告は出しません', normalized: '標準化: 0が基準範囲の下限、1が上限', weight: '体重', mgkg: 'mg/kg', perDay: '回/日', mgPerDose: '1回量 (mg)', reason: '理由', start: '開始日',
    generics: { phenobarbital: 'フェノバルビタール', potassium_bromide: '臭化カリウム', zonisamide: 'ゾニサミド', levetiracetam: 'レベチラセタム（イーケプラ）', imepitoin: 'イメピトイン', gabapentin: 'ガバペンチン（ガバペン）', diazepam: 'ジアゼパム', midazolam: 'ミダゾラム', supplement_trial_M010: 'サプリ（試験 M010）' },
    kinds: { maintenance: '維持', rescue: '頓服', trial: '試験' }, doseUnknown: '用量 未登録', schedule: '投薬時刻', scheduleNote: '1日の回数ぶん、時刻をコンマ区切りで（例 08:00, 20:00）', endDate: '終了日', stop: '中止する', stopped: '中止', adherence: '投薬の記録率',
  },
  chart: { title: '長期経過', seizures: '発作', unusual: 'いつもと違う日', episodes: '群発（大きさ＝持続時間）', bloodLevels: '血中濃度（基準範囲を 0–1 に標準化）と投薬変更', monitoring: 'モニタリング（T4・TSH・肝酵素）', period: { m1: '1か月', m3: '3か月', m6: '6か月', y1: '1年', all: '全期間' }, band: '基準範囲', doseLine: '投薬変更', monthlySource: '月次集計（2021.12〜2025.12はスプレッドシート、2026〜は記録から）' },
  report: {
    title: 'Vet Report', period: '観察期間', prnCount: '頓服の使用', seizures: '発作回数', seizureDays: '発作日数', episodes: '群発エピソード', longest: '最長発作', medianInterval: '発作間隔の中央値', change90: '直近90日 vs その前90日', meds: '投薬', labs: '最新の血中濃度・検査', chart: '長期経過', troughFooter: '血中濃度は毎回同じタイミングでの採血を前提に記録されています', weatherFooter: '気象は再解析データによる地点の推定値です', unknown: '不明', days: '日', dx: { idiopathic_epilepsy: '特発性てんかん' },
  },
  settings: {
    title: '設定', dogs: '犬', addDog: '犬を追加', name: '名前', weightKg: '体重 (kg)', addWeight: '体重を記録', profile: 'プロフィール', birthDate: '生年月日', sex: '性別', breed: '犬種', diagnosis: '診断名', diagnosisDate: '診断日', weightHistory: '体重の履歴', select: '選ぶ', deleteDog: 'この犬の記録をすべて削除', deleteDogConfirm: '{{name}} の記録をすべて削除します。よろしいですか？', noDog: '犬が登録されていません。設定から追加してください', sexes: { male: 'オス', male_neutered: 'オス（去勢）', female: 'メス', female_spayed: 'メス（避妊）', unknown: '未設定' }, display: '表示', language: '言語', region: '地域', useGps: '現在地から設定', gridNote: '保存されるのは気象を取るための約25km四方の区画だけです。住所や位置は保存しません', grid: '区画', notSet: '未設定',
    recording: '発作の記録', recordVideo: '開始と同時に録画する', recordNote: '録画中は画面をつけたままにしてください。ほかのアプリに切り替えると止まります', consent: '同意', consentAgg: '匿名の集計に参加する', consentRes: '研究に利用してよい', data: 'データ', export: 'データをエクスポート (JSON)', deleteAll: 'アカウントとデータを削除', deleteConfirm: 'この端末のデータをすべて削除します。よろしいですか？', role: '開発者プレビュー', roleNote: 'MVPでは端末の設定で切り替えます。公開版ではアカウントの役割で制御します', reseed: 'Tobyのサンプルデータを読み直す',
  },
  dev: {
    banner: '開発者プレビュー・一般非公開', community: '地域の発作報告', dog: '個体内の比較', activeDogs: '活動犬', rate: '報告率*', stage: '段階', stages: { collecting: '収集中', weekly_reference: '週次参考値', weekly: '週次表示', daily: '日次表示' },
    rateNote: '* 活動犬1,000頭あたりの発作報告（週）。段階: 150頭未満=収集中／150–400=週次参考値／400以上=週次表示／800以上=日次', localOnly: 'この端末のデータだけです。サーバー集計はSupabase接続後',
    analysable: '解析に足る記録があるか', seizureDays: '発作日', recordDays: '記録期間', ok: '解析可能', notYet: '未達', d24: '前24時間の気圧変化', seizureDay: '発作日', nonSeizureDay: '非発作日', diff: '差', ci: '幅', obs: '観察であり因果ではない', fetchDaily: '背景の気象を取り込む', judgement: '示唆表示の判定（本日）', forecast: '今後24h予測', hit: '条件に該当', nohit: '該当なし', unpublished: '未公開', text: '表示予定の文言',
    suggestion: 'この子が過去に発作を記録した日の前に多かった気圧の下がり方に近づいています', disclaimer: 'これは過去の記録との比較であり、発作を予測するものではありません', noGrid: '設定で地域を登録してください', dailyCount: '取り込み済みの日数',
  },
  login: { title: 'ログイン', intro: '記録を共有するためにログインします。初めての方は「新しく登録」からメールアドレスとパスワードを決めてください（許可されたメールアドレスだけが参加できます）', email: 'メールアドレス', password: 'パスワード（6文字以上）', signIn: 'ログイン', signUp: '登録してログイン', newAccount: '新しく登録', haveAccount: '登録済みの方', forgot: 'パスワードを忘れた', checkEmail: '確認メールを送りました。メールのリンクを開いてから、もう一度ログインしてください', resetSent: '再設定のメールを送りました', signOut: 'ログアウト', notAllowed: 'このメールアドレスは参加を許可されていません。所有者に追加してもらってください', signedInAs: 'ログイン中' },
  alert: { title: '投薬の時間です', body: '記録がない予定です。飲ませたら「飲ませた」を押してください。押されるまで {{min}} 分ごとに知らせます', overdue: '予定から {{min}} 分', later: '{{min}}分後にもう一度', settings: '投薬アラート', enabled: 'アラートを出す', interval: '繰り返しの間隔（分）', sound: '音を鳴らす', notify: 'ブラウザの通知を許可する', notifyGranted: '通知は許可されています', notifyDenied: '通知はブロックされています（ブラウザの設定で変更できます）', notifyUnsupported: 'この環境では通知を使えません', scope: 'アラートはアプリを開いている間に出ます。閉じている間の通知は下の「プッシュ通知」をオンにしてください', push: 'プッシュ通知（閉じていても届く）', pushOn: 'この端末で受け取る', pushOff: '受け取りをやめる', pushState: { unsupported: 'この環境ではプッシュ通知を使えません', need_install: 'iPhoneでは、Safariの共有メニューから「ホーム画面に追加」して、そのアイコンから開くと設定できます', denied: '通知がブロックされています。端末の設定で許可してください', subscribed: 'この端末で受け取ります。予定時刻を過ぎると、記録されるまで30分ごとに届きます', not_subscribed: 'まだ設定されていません' } },
  plan: { title: '投薬予定', add: '投薬予定を追加', upcoming: 'これからの投薬予定', repeat: '繰り返し', times: '回', every: '時間ごと', none: '予定はありません', cancel: '取り消す', cancelled: '取り消し', done: '済', planTab: '投薬予定（頓服のスケジュール）', planNote: '主治医と決めた頓服の予定をここに入れておくと、ホームに表示され、時刻を過ぎると知らせます', first: '1回目の日時' },
  add: { title: '記録を追加', seizureTab: '過去の発作・いつもと違う日', doseTab: '投薬（頓服・時刻指定）', date: '日付', time: '時刻', datetime: '日時', doseKind: '区分', prn: '頓服', scheduled: '定時', drug: '薬', registered: '登録済みの薬', generics: '薬の一覧', other: 'その他（名前を入力）', otherName: '薬の名前', mgOptional: '省略可', seizureNote: '保存すると詳細画面が開き、救急薬・前兆・動画・気象などを追記できます', doseNote: '頓服は発作の詳細画面からも記録できます。ここでは日付と時刻を自由に指定できます', addSeizure: '過去の発作を追加', addDose: '投薬を記録（頓服・時刻指定）' },
  labimg: { title: '検査結果の写真・スクリーンショット', intro: '写真を選ぶと添付されます。「読み取る」で日付・項目・数値・基準範囲を自動で入力欄に入れます（Claudeが画像を読みます。初回は許可を求められます）。入力された値は保存前に必ず確認してください', introNoRead: '写真を選ぶと記録に添付されます。この画面では自動読み取りは使えません（claude.ai のページで開くと使えます）', pick: '撮影する', pickFile: 'ファイルを選ぶ', read: '読み取る', reading: '読み取り中…', done: '{{n}} 項目を読み取りました（対象外 {{other}} 件はメモに入れました）。値を確認して保存してください', failed: '読み取れませんでした。手で入力してください', notGranted: 'この画面でのClaudeの利用が許可されていません。手で入力してください', notConfigured: '読み取り機能はまだ設定されていません（Claude APIの鍵が未登録）。手で入力してください', converted: '単位を変換しました', saveRanges: 'この基準範囲を検査機関の値として保存', rangesSaved: '基準範囲を保存しました', image: '報告書の画像', labName: '検査機関', paste: 'PCではスクリーンショットをコピーして、この画面で貼り付け（Ctrl+V）もできます。', deviceOnly: '画像はこの端末にだけ保存されます（共有先では見られません）' },
  dose: { today: '今日の投薬', give: '飲ませた', undo: 'タップで取り消し', undoConfirm: 'この投薬の記録を取り消しますか？', noMeds: '維持薬が登録されていません。', hint: 'ボタンを押した時刻が記録されます。間違えたら ✓ をタップして取り消せます' },
  cloud: {
    title: '共有', pending: '送信待ち {{n}} 件',
    status: { init: '接続を確認しています', login: 'ログインすると共有が始まります', local: 'この端末だけに保存（共有オフ）', syncing: '共有データを同期中', ready: '共有中：2人の入力が両方に反映されます', readonly: '閲覧のみ：書き込み権限がありません（共有メニューで編集者に）', error: '共有の接続に失敗しました' },
    short: { init: '…', login: '未ログイン', local: '端末のみ', syncing: '同期中', ready: '共有中', readonly: '閲覧のみ', error: 'エラー' },
    localNote: 'claude.ai のページとして開くと、ログインした人どうしで同じデータを共有できます。この画面（開発用）では端末内だけに保存します',
    sharedNote: '記録は claude.ai の共有データベースに保存され、招待された人全員の画面に反映されます。動画だけは記録した端末に残ります',
  },
  eplan: {
    title: '発作が長引いたときの手順', intro: '主治医と相談して決めた手順を、ここに書いておきます。発作が長引いたとき、順番に表示します', disclaimer: 'このアプリは薬や量を指示しません。表示されるのは、あなたが主治医と決めて登録した文だけです',
    triggerMin: '何分を超えたら表示するか', steps: 'ステップ', stepN: 'ステップ {{n}}', addStep: 'ステップを追加', placeholder: '例: 主治医から渡された薬を使う（薬の名前と量は主治医の指示どおりに）', vetName: '主治医・病院', vetPhone: '電話番号', hospitalNote: '病院への行き方メモ',
    calm: '落ち着きましょう', over: '{{min}}分を超えています。主治医と決めた手順を順に確認します', did: 'やった → 次へ', notYet: 'まだ', callVet: '主治医に電話', goHospital: '落ち着いて。止まらなければ、このまま病院へ', noPlan: '手順が登録されていません。今は主治医の指示に従ってください。落ち着いたら、主治医と相談した手順を設定に登録してください', allDone: '手順はすべて確認しました', actionsTaken: '長引いたときに確認した手順', remove: '削除',
  },
  common: { dog: '犬', loading: '読み込み中', saved: '保存しました', error: 'エラー', yes: 'はい', no: 'いいえ', min: '分', sec: '秒', hPa: 'hPa', today: '今日' },
}

const en: typeof ja = {
  app: 'PurpleLog',
  nav: { home: 'Home', timeline: 'Log', chart: 'Trend', meds: 'Meds & Labs', report: 'Report', settings: 'Settings', dev: 'Developer' },
  btn: { seizureStart: 'Seizure started', unusual: 'Not normal', save: 'Save', cancel: 'Cancel', delete: 'Delete', add: 'Add', print: 'Print / PDF', later: 'Record later', back: 'Back' },
  home: {
    thisMonth: 'Seizures this month', vsPrev: 'vs last month', sinceLast: 'Since last seizure', days: 'days', times: '', last30: 'Last 30 days', nextCheck: 'Next suggested check', recent: 'Recent events',
    noSeizure: 'none', guidance: 'Guidance only, not an instruction', monthlyOnly: '(monthly records only)',
  },
  seizure: {
    title: 'Seizure', tapStart: 'Tap to start', recording: 'Recording', videoOn: 'Video', ended: 'Seizure ended', tapEnd: 'Tap to stop timer and video', rescue: 'Rescue medication given (log time)',
    fiveMin: 'Over 5 minutes. Follow your veterinarian’s instructions', screenNote: 'The screen stays on. Switching apps stops the video', videoOpt: 'Video option', on: 'on', off: 'off', cameraStart: 'Camera starts with the timer',
  },
  event: {
    title: 'Event details', kind: 'Kind', seizure: 'Seizure', unusual: 'Not normal', other: 'Other', start: 'Start', end: 'End', duration: 'Duration', count: 'Count', type: 'Seizure type', consciousness: 'Consciousness', recovery: 'Recovery (min)', aura: 'Warning signs', rescue: 'Rescue medication', note: 'Notes', video: 'Video', weather: 'Weather at this time (automatic)', fetchWeather: 'Fetch weather', noGrid: 'Set a region in Settings to fetch weather',
    types: { generalized_tonic_clonic: 'Whole body stiff, convulsing', focal: 'One part of the body', focal_behavioral: 'Dazed, drooling', focal_to_generalized: 'Started in one part, then whole body', unknown: 'Not sure' },
    cons: { lost: 'lost', kept: 'kept', unknown: 'not sure' },
    items: { mania: 'Manic', pica: 'Ate something odd', elimination: 'Elimination problem', ataxia: 'Wobbly', weakness: 'Weak legs', lethargy: 'Lethargic', appetite_down: 'Less appetite', appetite_up: 'More appetite', weight: 'Weight change', skin: 'Skin / coat change', pacing: 'Pacing', vomiting: 'Vomiting', hyperactive: 'Hyperactive', eye_twitch: 'Eye symptoms', urination: 'Urination problem', other: 'Other' },
    estimated: 'estimated', timeUnknown: 'time unknown',
  },
  timeline: { title: 'Timeline', cluster: 'Cluster episode', seizures: 'seizures', hours: 'h', doseChange: 'Dose change', doseLog: 'Dose given', prnLog: 'As-needed', lab: 'Lab', weight: 'Weight', unusualNear: '“Not normal” days within 30 days of this lab', none: 'none', monthly: 'Monthly records (no dates)', showDoses: 'Show doses given' },
  meds: {
    title: 'Medication & labs', current: 'Current medication', history: 'Changes', change: 'Change', labs: 'Serum levels & labs', addLab: 'Add lab result', analyte: 'Analyte', value: 'Value', unit: 'Unit', date: 'Sampling time', lastDose: 'Last dose', hoursSince: 'h ago', timing: 'Timing',
    trough: 'Before next dose (trough)', post_dose: 'Post-dose', not_applicable: '(timing not critical)', unknown: 'unknown', sameAsPrev: 'same as previous', diffFromPrev: 'Timing differs from the previous sample',
    troughNote: 'Serum levels are compared on samples taken at the same time each visit (just before the next dose)',
    ref: 'Ref', noWarn: 'Reference ranges are those of this laboratory. Low values do not trigger alerts', normalized: 'Normalized: 0 = lower limit, 1 = upper limit', weight: 'Weight', mgkg: 'mg/kg', perDay: 'per day', mgPerDose: 'mg per dose', reason: 'Reason', start: 'Start',
    generics: { phenobarbital: 'Phenobarbital', potassium_bromide: 'Potassium bromide', zonisamide: 'Zonisamide', levetiracetam: 'Levetiracetam (Keppra)', imepitoin: 'Imepitoin', gabapentin: 'Gabapentin', diazepam: 'Diazepam', midazolam: 'Midazolam', supplement_trial_M010: 'Supplement (trial M010)' },
    kinds: { maintenance: 'Maintenance', rescue: 'Rescue', trial: 'Trial' }, doseUnknown: 'dose not recorded', schedule: 'Dose times', scheduleNote: 'One clock time per daily dose, comma-separated (e.g. 08:00, 20:00)', endDate: 'End date', stop: 'Stop', stopped: 'stopped', adherence: 'Doses recorded',
  },
  chart: { title: 'Long-term trend', seizures: 'Seizures', unusual: 'Not-normal days', episodes: 'Clusters (size = duration)', bloodLevels: 'Serum levels (normalized to reference range 0–1) and dose changes', monitoring: 'Monitoring (T4, TSH, liver enzymes)', period: { m1: '1 mo', m3: '3 mo', m6: '6 mo', y1: '1 yr', all: 'All' }, band: 'Reference range', doseLine: 'Dose change', monthlySource: 'Monthly totals (Dec 2021–Dec 2025 from spreadsheet, 2026– from records)' },
  report: {
    title: 'Vet Report', period: 'Observation period', prnCount: 'As-needed doses', seizures: 'Seizures', seizureDays: 'Seizure days', episodes: 'Cluster episodes', longest: 'Longest seizure', medianInterval: 'Median interval', change90: 'Last 90 days vs previous 90', meds: 'Medication', labs: 'Latest serum levels & labs', chart: 'Long-term trend', troughFooter: 'Serum levels are recorded on the assumption of consistent sampling time', weatherFooter: 'Weather values are reanalysis estimates for the location', unknown: 'unknown', days: 'days', dx: { idiopathic_epilepsy: 'Idiopathic epilepsy' },
  },
  settings: {
    title: 'Settings', dogs: 'Dogs', addDog: 'Add dog', name: 'Name', weightKg: 'Weight (kg)', addWeight: 'Record weight', profile: 'Profile', birthDate: 'Date of birth', sex: 'Sex', breed: 'Breed', diagnosis: 'Diagnosis', diagnosisDate: 'Diagnosis date', weightHistory: 'Weight history', select: 'Select', deleteDog: 'Delete all records of this dog', deleteDogConfirm: 'Delete all records of {{name}}?', noDog: 'No dog registered yet. Add one in Settings', sexes: { male: 'Male', male_neutered: 'Male (neutered)', female: 'Female', female_spayed: 'Female (spayed)', unknown: 'Not set' }, display: 'Display', language: 'Language', region: 'Region', useGps: 'Use current location', gridNote: 'Only a 25 km grid cell used for weather is stored. No address or location is saved', grid: 'Grid cell', notSet: 'not set',
    recording: 'Seizure recording', recordVideo: 'Start video with the timer', recordNote: 'Keep the screen on while recording. Switching apps stops the video', consent: 'Consent', consentAgg: 'Join anonymous aggregation', consentRes: 'Allow research use', data: 'Data', export: 'Export data (JSON)', deleteAll: 'Delete account and data', deleteConfirm: 'Delete all data on this device?', role: 'Developer preview', roleNote: 'In the MVP this is a device setting. The public version controls it by account role', reseed: 'Reload Toby sample data',
  },
  dev: {
    banner: 'Developer preview · not public', community: 'Regional seizure reports', dog: 'Within-dog comparison', activeDogs: 'Active dogs', rate: 'Rate*', stage: 'Stage', stages: { collecting: 'Collecting', weekly_reference: 'Weekly (reference)', weekly: 'Weekly', daily: 'Daily' },
    rateNote: '* Seizure reports per 1,000 active dogs per week. Stages: <150 collecting / 150–400 weekly reference / ≥400 weekly / ≥800 daily', localOnly: 'Local device data only. Server aggregation after Supabase is connected',
    analysable: 'Enough records to analyse?', seizureDays: 'Seizure days', recordDays: 'Record span', ok: 'Analysable', notYet: 'Not yet', d24: 'Pressure change over previous 24 h', seizureDay: 'Seizure days', nonSeizureDay: 'Other days', diff: 'Difference', ci: '95% range', obs: 'Observation, not causation', fetchDaily: 'Import background weather', judgement: 'Suggestion check (today)', forecast: 'Next 24 h forecast', hit: 'Condition met', nohit: 'Not met', unpublished: 'Unpublished', text: 'Planned wording',
    suggestion: 'The pressure drop is approaching what this dog had before past seizures', disclaimer: 'This compares with past records; it does not predict a seizure', noGrid: 'Set a region in Settings', dailyCount: 'Days imported',
  },
  login: { title: 'Sign in', intro: 'Sign in to share records. First time: choose “New account” and set an email and password (only allowed emails can join)', email: 'Email', password: 'Password (6+ characters)', signIn: 'Sign in', signUp: 'Create account and sign in', newAccount: 'New account', haveAccount: 'I have an account', forgot: 'Forgot password', checkEmail: 'Confirmation email sent. Open the link in the email, then sign in again', resetSent: 'Reset email sent', signOut: 'Sign out', notAllowed: 'This email is not allowed to join. Ask the owner to add it', signedInAs: 'Signed in as' },
  alert: { title: 'Time for a dose', body: 'These doses have no record yet. Tap “given” once done. Reminders repeat every {{min}} min until then', overdue: '{{min}} min past due', later: 'Remind me in {{min}} min', settings: 'Dose reminders', enabled: 'Show reminders', interval: 'Repeat every (min)', sound: 'Play a sound', notify: 'Allow browser notifications', notifyGranted: 'Notifications allowed', notifyDenied: 'Notifications blocked (change in browser settings)', notifyUnsupported: 'Notifications unavailable here', scope: 'Reminders appear while the app is open. For alerts while closed, turn on Push below', push: 'Push notifications (also when closed)', pushOn: 'Receive on this device', pushOff: 'Stop receiving', pushState: { unsupported: 'Push is not available here', need_install: 'On iPhone, add the app to the Home Screen from Safari’s share menu and open it from the icon', denied: 'Notifications are blocked. Allow them in device settings', subscribed: 'This device receives reminders: every 30 min after a due time until the dose is recorded', not_subscribed: 'Not set up yet' } },
  plan: { title: 'Planned doses', add: 'Add planned dose', upcoming: 'Upcoming planned doses', repeat: 'Repeat', times: 'times', every: 'h apart', none: 'No planned doses', cancel: 'Cancel', cancelled: 'cancelled', done: 'done', planTab: 'Planned doses (as-needed schedule)', planNote: 'Enter the as-needed schedule agreed with your vet; it shows on Home and alerts when the time has passed', first: 'First dose at' },
  add: { title: 'Add a record', seizureTab: 'Past seizure / not-normal day', doseTab: 'Dose (as-needed / set time)', date: 'Date', time: 'Time', datetime: 'Date & time', doseKind: 'Kind', prn: 'As-needed', scheduled: 'Scheduled', drug: 'Drug', registered: 'Registered', generics: 'Drug list', other: 'Other (type a name)', otherName: 'Drug name', mgOptional: 'optional', seizureNote: 'After saving, the detail screen opens to add rescue medication, warning signs, video or weather', doseNote: 'As-needed doses can also be logged from a seizure’s detail screen. Here you choose any date and time', addSeizure: 'Add a past seizure', addDose: 'Log a dose (as-needed / set time)' },
  labimg: { title: 'Photo / screenshot of the lab report', intro: 'Pick a photo to attach it. “Read” fills date, analytes, values and reference ranges (Claude reads the image; you are asked once). Always check the values before saving', introNoRead: 'Pick a photo to attach it to the record. Automatic reading is not available here (open the claude.ai page)', pick: 'Take photo', pickFile: 'Choose file', read: 'Read', reading: 'Reading…', done: '{{n}} items read ({{other}} unmatched items put in notes). Check the values, then save', failed: 'Could not read it. Please enter values by hand', notGranted: 'Claude is not allowed on this page. Please enter values by hand', notConfigured: 'Reading is not configured yet (no Claude API key). Please enter values by hand', converted: 'Unit converted', saveRanges: 'Save these reference ranges for this laboratory', rangesSaved: 'Reference ranges saved', image: 'Report image', labName: 'Laboratory', paste: 'On a computer you can also paste a copied screenshot here (Ctrl+V).', deviceOnly: 'The image is stored on this device only (not visible to others)' },
  dose: { today: 'Today’s doses', give: 'given', undo: 'Tap to undo', undoConfirm: 'Remove this dose record?', noMeds: 'No maintenance medication registered.', hint: 'The time you tap is recorded. Tap ✓ to undo a mistake' },
  cloud: {
    title: 'Sharing', pending: '{{n}} pending',
    status: { init: 'Checking connection', login: 'Sign in to start sharing', local: 'Stored on this device only (sharing off)', syncing: 'Syncing shared data', ready: 'Shared: entries from both of you appear on both', readonly: 'Read-only: no write permission (ask for Editor in Share)', error: 'Could not connect to shared data' },
    short: { init: '…', login: 'sign in', local: 'device', syncing: 'syncing', ready: 'shared', readonly: 'read-only', error: 'error' },
    localNote: 'Opened as a claude.ai page, signed-in people share the same data. Here (development) data stays on this device',
    sharedNote: 'Records are stored in the claude.ai shared database and appear for everyone invited. Only videos stay on the device that recorded them',
  },
  eplan: {
    title: 'If a seizure goes on too long', intro: 'Write here the steps you agreed with your veterinarian. They are shown in order when a seizure runs long', disclaimer: 'This app never tells you which drug or how much. Only the text you entered with your veterinarian is shown',
    triggerMin: 'Show after (minutes)', steps: 'Steps', stepN: 'Step {{n}}', addStep: 'Add step', placeholder: 'e.g. Use the rescue medication your vet gave you, exactly as instructed', vetName: 'Veterinarian / clinic', vetPhone: 'Phone', hospitalNote: 'How to get to the clinic',
    calm: 'Stay calm', over: 'Over {{min}} minutes. Let’s go through the steps you agreed with your vet', did: 'Done → next', notYet: 'Not yet', callVet: 'Call the vet', goHospital: 'Stay calm. If it does not stop, go to the clinic now', noPlan: 'No steps registered. Follow your veterinarian’s instructions now. Later, add the steps you agreed with your vet in Settings', allDone: 'All steps checked', actionsTaken: 'Steps checked during the long seizure', remove: 'Remove',
  },
  common: { dog: 'Dog', loading: 'Loading', saved: 'Saved', error: 'Error', yes: 'Yes', no: 'No', min: 'min', sec: 's', hPa: 'hPa', today: 'Today' },
}

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja }, en: { translation: en } },
  lng: 'ja',
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
})

export default i18n
