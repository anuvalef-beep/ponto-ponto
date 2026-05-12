import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz;
import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'package:alarm/alarm.dart';
import '../models/app_settings.dart' as models;
import '../signals/app_signals.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    tz.initializeTimeZones();
    try {
      tz.setLocalLocation(tz.getLocation('America/Sao_Paulo'));
    } catch (e) {}

    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
        
    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
    );

    await _notifications.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        if (response.payload != null) {
          AppSignals.incomingNotification.value = response.payload;
        }
      },
    );

    final platform = _notifications.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    
    if (platform != null) {
      await platform.requestNotificationsPermission();
      await platform.requestExactAlarmsPermission();
      
      // Explicitly create the high importance channel
      const AndroidNotificationChannel channel = AndroidNotificationChannel(
        'ponto_alarms_v7',
        'Alarmes de Ponto',
        description: 'Lembretes insistentes de batida de ponto',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
        showBadge: true,
      );
      await platform.createNotificationChannel(channel);
    }
  }

  static Future<void> testAlarm() async {
    final now = tz.TZDateTime.now(tz.local);
    final scheduledDate = now.add(const Duration(seconds: 10));

    await _notifications.zonedSchedule(
      999,
      'Teste de Alarme Nativo',
      'Este alarme usa o som padrão do seu Android.',
      scheduledDate,
      NotificationDetails(
        android: AndroidNotificationDetails(
          'ponto_alarms_v7',
          'Alarmes de Ponto',
          channelDescription: 'Canal para lembretes de batida de ponto',
          importance: Importance.max,
          priority: Priority.max,
          fullScreenIntent: true,
          category: AndroidNotificationCategory.alarm,
          audioAttributesUsage: AudioAttributesUsage.alarm,
          playSound: true,
          enableVibration: true,
          vibrationPattern: Int64List.fromList([0, 1000, 500, 1000]),
          additionalFlags: Int32List.fromList([4]), // FLAG_INSISTENT
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      payload: 'test',
    );

    final alarmSettings = AlarmSettings(
      id: 999,
      dateTime: scheduledDate,
      assetAudioPath: 'assets/alarm.mp3',
      loopAudio: true,
      vibrate: true,
      volume: 0.8,
      notificationTitle: 'Teste de Alarme',
      notificationBody: 'O despertador real está funcionando!',
      enableNotificationOnKill: true,
    );
    
    await Alarm.set(alarmSettings: alarmSettings);
  }

  static Future<void> scheduleAlarm({
    required int id,
    required String type,
    required String title,
    required String body,
    required String timeStr, // Recebe string HH:mm
  }) async {
    final parts = timeStr.split(':');
    if (parts.length != 2) return;
    
    final hour = int.parse(parts[0]);
    final minute = int.parse(parts[1]);

    final now = tz.TZDateTime.now(tz.local);
    var scheduledDate = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );

    if (scheduledDate.isBefore(now)) {
      scheduledDate = scheduledDate.add(const Duration(days: 1));
    }

    await _notifications.zonedSchedule(
      id.abs(),
      title,
      body,
      scheduledDate,
      NotificationDetails(
        android: AndroidNotificationDetails(
          'ponto_alarms_v7',
          'Alarmes de Ponto',
          channelDescription: 'Lembretes insistentes de ponto',
          importance: Importance.max,
          priority: Priority.max,
          fullScreenIntent: true,
          category: AndroidNotificationCategory.alarm,
          audioAttributesUsage: AudioAttributesUsage.alarm,
          playSound: true,
          enableVibration: true,
          vibrationPattern: Int64List.fromList([0, 1000, 500, 1000]),
          additionalFlags: Int32List.fromList([4]), // FLAG_INSISTENT
          visibility: NotificationVisibility.public,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: 'alarm_$type',
    );

    // REAL ALARM MIGRATION:
    // We also schedule a real alarm that plays sound until stopped.
    final alarmSettings = AlarmSettings(
      id: id.abs(),
      dateTime: scheduledDate,
      assetAudioPath: 'assets/alarm.mp3',
      loopAudio: true,
      vibrate: true,
      volume: 0.8,
      fadeDuration: 3.0,
      notificationTitle: title,
      notificationBody: body,
      enableNotificationOnKill: true,
    );
    
    await Alarm.set(alarmSettings: alarmSettings);
  }

  static Future<void> cancelAlarm(int id) async {
    await _notifications.cancel(id.abs());
    await Alarm.stop(id.abs());
  }

  static Future<void> rescheduleAllAlarms(models.AppSettings settings) async {
    await _notifications.cancelAll();
    
    for (var entry in settings.alarms.entries) {
      final type = entry.key;
      final alarm = entry.value;
      if (alarm.enabled) {
        await scheduleAlarm(
          id: type.hashCode.abs(),
          type: type,
          title: 'Lembrete de Ponto',
          body: 'Está na hora da sua batida de ${type.toUpperCase()}!',
          timeStr: alarm.time,
        );
      }
    }
  }
}
