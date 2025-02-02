//環境設定
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN = SCRIPT_PROPERTIES.getProperty("LINE_ACCESS_TOKEN");
const SS_ID_A= SCRIPT_PROPERTIES.getProperty("SS_ID_A"); // AさんのスプレッドシートID
const SS_ID_B = SCRIPT_PROPERTIES.getProperty("SS_ID_B");
const CALENDAR_ID_A = SCRIPT_PROPERTIES.getProperty("CALENDAR_ID_A"); //AさんのカレンダーID
const CALENDAR_ID_B = SCRIPT_PROPERTIES.getProperty("CALENDAR_ID_B");
const CHECK_DAY_WINDOW = 30 // 30日間の変更をチェックする
const DEBUG = true;


// 📌 通知のフォーマットを統一する関数．形式に関してはdetector.gsを参照．
function formatNotification(result) {
  let message = "";

  if (result.newEvents.length > 0) message += "\n\n" + result.newEvents.join("\n\n────────────\n\n") + "\n\n";
  if (result.changedEvents.length > 0) message += "\n\n" + result.changedEvents.join("\n\n────────────\n\n") + "\n\n";
  if (result.deletedEvents.length > 0) message += "\n\n" + result.deletedEvents.join("\n\n────────────\n\n") + "\n\n";

  return message;
}

// カレンダーの変化を検知し，差分を返す関数，
function processCalendar(calendarId, spreadsheetId) {
  const detector = new GoogleCalendarDetector(calendarId, spreadsheetId);
  const events = detector.getEvents();
  const result = detector.detectChanges(events);

  // **🔹 スプレッドシートを更新**
  detector.updateSpreadsheet(result.newEventData);

  return result;
}


function main() {
  const calendars = [
    { name: "A", calendarId: CALENDAR_ID_A, spreadsheetId: SS_ID_A },
    { name: "B", calendarId: CALENDAR_ID_B, spreadsheetId: SS_ID_B }
  ];

  const lineNotifier = new LineNotifier(LINE_ACCESS_TOKEN);
  let combinedMessage = "";

  // **🔹 すべてのカレンダーをループ処理**
  for (const calendar of calendars) {
    const result = processCalendar(calendar.calendarId, calendar.spreadsheetId);

    // **🔹 変更があった場合、メッセージに追加**
    if (result.newEvents.length || result.changedEvents.length || result.deletedEvents.length) {
      if (combinedMessage) combinedMessage += "\n\n"; // カレンダーの間にスペースを入れる
      combinedMessage += `📅 カレンダー名: ${CalendarApp.getCalendarById(calendar.calendarId).getName()}\n`;
      combinedMessage += formatNotification(result);
    }
  }

  // **🔹 デバッグモードでメッセージを確認**
  if (DEBUG) {
    console.log("🔍 [DEBUG] 送信メッセージ:\n" + combinedMessage);
    return ;
  }

  // **🔹 メッセージがある場合のみ送信**
  if (combinedMessage.trim()) {
    console.log("🔍 送信メッセージ:\n" + combinedMessage);
    lineNotifier.sendToAll(combinedMessage);
  }
}


