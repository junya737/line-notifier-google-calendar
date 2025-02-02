//環境設定
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN = SCRIPT_PROPERTIES.getProperty("LINE_ACCESS_TOKEN");
const SS_ID_A= SCRIPT_PROPERTIES.getProperty("SS_ID_A"); // AさんのスプレッドシートID
const SS_ID_B = SCRIPT_PROPERTIES.getProperty("SS_ID_B");
const CALENDAR_ID_A = SCRIPT_PROPERTIES.getProperty("CALENDAR_ID_A"); //AさんのカレンダーID
const CALENDAR_ID_B = SCRIPT_PROPERTIES.getProperty("CALENDAR_ID_B");
const CHECK_DAY_WINDOW = 30 // 30日間の変更をチェックする
const DEBUG = true;


class LineNotifier {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiUrl = "https://api.line.me/v2/bot/message";
  }


  // 共通のリクエスト送信処理
  sendRequest(endpoint, payload) {
    const url = `${this.apiUrl}/${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + this.accessToken
    };

    const options = {
      "method": "post",
      "headers": headers,
      "payload": JSON.stringify(payload)
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      Logger.log(`送信成功: ${response.getContentText()}`);
    } catch (e) {
      Logger.log(`エラー発生: ${e.toString()}`);
    }
  }

  // 個別送信
  sendToUser(message, userId) {
    if (!userId) {
      Logger.log("エラー: ユーザーIDが設定されていません");
      return;
    }

    const payload = {
      "to": userId,
      "messages": [{ "type": "text", "text": message }]
    };

    this.sendRequest("push", payload);
  }

  // 全員に送信
  sendToAll(message) {
    const payload = {
      "messages": [{ "type": "text", "text": message }]
    };

    this.sendRequest("broadcast", payload);
  }
}

class GoogleCalendarDetector {
  constructor(calendarId, spreadsheetId) {
    this.calendarId = calendarId;
    this.spreadsheetId = spreadsheetId;
    this.calendarName = CalendarApp.getCalendarById(this.calendarId).getName(); // カレンダー名を取得
  }

  // 📌 日時を "YYYY/MM/DD HH:mm" または "YYYY/MM/DD"（終日イベント用）にフォーマット
  formatDateTime(date, isAllDay) {
    let d = new Date(date);
    let year = d.getFullYear();
    let month = ("0" + (d.getMonth() + 1)).slice(-2);
    let day = ("0" + d.getDate()).slice(-2);
    if (isAllDay) {
      return `${year}/${month}/${day}`; // 終日イベントは時間なし
    }
    let hours = ("0" + d.getHours()).slice(-2);
    let minutes = ("0" + d.getMinutes()).slice(-2);
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  }

  // 📌 Googleカレンダーのイベントを取得
  getEvents() {
    const calendar = CalendarApp.getCalendarById(this.calendarId);
    const now = new Date();
    const future = new Date(now.getTime() + CHECK_DAY_WINDOW * 24 * 60 * 60 * 1000);
    return calendar.getEvents(now, future);
  }

    // 📌 カレンダーの変更を検出（終日イベントの処理を修正）
  detectChanges(events) {
    const sheet = SpreadsheetApp.openById(this.spreadsheetId).getActiveSheet();
    const oldData = sheet.getDataRange().getValues();
    let oldEventMap = {};

    // スプレッドシートの過去データをマップ化（Date → フォーマット統一）
    for (let i = 1; i < oldData.length; i++) {
      let oldEventId = oldData[i][0] || "";
      let oldTitle = oldData[i][1] || "";
      let isAllDay = oldData[i][5] === "終日"; // 終日イベントかどうか
      let oldStartTime = oldData[i][2] ? this.formatDateTime(new Date(oldData[i][2]), isAllDay) : "";
      let oldEndTime = oldData[i][3] ? this.formatDateTime(new Date(oldData[i][3]), isAllDay) : "";
      let oldLocation = oldData[i][4] || "なし";

      oldEventMap[oldEventId] = { 
        title: oldTitle, 
        startTime: oldStartTime, 
        endTime: oldEndTime, 
        location: oldLocation, 
        isAllDay: isAllDay 
      };
    }

    let newEventData = [];
    let newEvents = [];
    let changedEvents = [];
    let deletedEvents = [];

    // 現在のイベントと過去データを比較
    events.forEach(event => {
      let eventId = event.getId();
      let eventTitle = event.getTitle();
      let isAllDay = event.isAllDayEvent(); // 終日イベントの判定
      let startTime = this.formatDateTime(event.getStartTime(), isAllDay);
      let endTime = this.formatDateTime(event.getEndTime(), isAllDay);
      let location = event.getLocation() || "なし";

      newEventData.push([eventId, eventTitle, startTime, endTime, location, isAllDay ? "終日" : "通常"]);

      if (!oldEventMap[eventId]) {
        // 🆕 新しいイベント
        newEvents.push(`🆕 新しい予定:\n📝 ${eventTitle}\n📍 ${location}\n🕒 ${startTime} ~ ${endTime}`);
      } else {
        let oldEvent = oldEventMap[eventId];
        let changes = [];

        // 🔹 変更された項目を特定し、リスト化（変更がない場合は記録しない）
        if (oldEvent.title !== eventTitle) {
          changes.push(`🔸 *予定名変更:* 「${oldEvent.title}」→「${eventTitle}」`);
        }
        if (oldEvent.startTime !== startTime || oldEvent.endTime !== endTime) {
          changes.push(`🔸 *時間変更:* ${oldEvent.startTime} ~ ${oldEvent.endTime} → ${startTime} ~ ${endTime}`);
        }
        if (oldEvent.location !== location) {
          changes.push(`🔸 *場所変更:* 「${oldEvent.location}」→「${location}」`);
        }

        // 変更があった場合のみ通知を送る
        if (changes.length > 0) {
          changedEvents.push(`🔄 予定変更:\n📝 ${eventTitle}\n📍 ${location}\n🕒 ${startTime} ~ ${endTime}\n` + changes.join("\n"));
        }

        delete oldEventMap[eventId]; // 検出済みのイベントを削除
      }
    });

    // 🔄 削除されたイベントの検出（イベント名だけでなく、時間・場所も通知）
    for (let eventId in oldEventMap) {
      let oldEvent = oldEventMap[eventId];
      deletedEvents.push(`❌ 予定削除:\n📝 ${oldEvent.title}\n📍 ${oldEvent.location}\n🕒 ${oldEvent.startTime} ~ ${oldEvent.endTime}`);
    }

    return { newEventData, newEvents, changedEvents, deletedEvents };
  }

  // 📌 スプレッドシートを更新
  updateSpreadsheet(newEventData) {
    const sheet = SpreadsheetApp.openById(this.spreadsheetId).getActiveSheet();
    sheet.clear(); // 既存データをクリア
    sheet.appendRow(["イベントID", "タイトル", "開始時刻", "終了時刻", "場所", "種別"]);
    newEventData.forEach(row => sheet.appendRow(row));
  }
}

// 📌 通知のフォーマットを統一する関数
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


