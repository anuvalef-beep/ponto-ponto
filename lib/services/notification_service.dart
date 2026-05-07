import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz;
import 'package:flutter/material.dart';
import 'dart:typed_data';
import '../models/app_settings.dart' as models;

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

    await _notifications.initialize(initializationSettings);

    final platform = _notifications.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    
    if (platform != null) {
      await platform.requestNotificationsPermission();
      await platform.requestExactAlarmsPermission();
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
          'ponto_alarms_v6',
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
    );
  }

  static Future<void> scheduleAlarm({
    required int id,
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
          'ponto_alarms_v6',
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
    );
  }

  static Future<void> cancelAlarm(int id) async {
    await _notifications.cancel(id.abs());
  }

  static Future<void> rescheduleAllAlarms(models.AppSettings settings) async {
    await _notifications.cancelAll();
    
    settings.alarms.forEach((type, alarm) async {
      if (alarm.enabled) {
        await scheduleAlarm(
          id: type.hashCode.abs(),
          title: 'Lembrete de Ponto',
          body: 'Está na hora da sua batida de ${type.toUpperCase()}!',
          timeStr: alarm.time,
        );
      }
    });
  }
}
