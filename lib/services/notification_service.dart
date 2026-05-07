import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz;
import 'dart:typed_data';
import '../models/app_settings.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    tz.initializeTimeZones();
    
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
        
    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
    );

    await _notifications.initialize(initializationSettings);

    // Request permissions for Android 13+ and Exact Alarms
    final platform = _notifications.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    
    if (platform != null) {
      await platform.requestNotificationsPermission();
      await platform.requestExactAlarmsPermission();
    }
  }

  static Future<void> rescheduleAllAlarms(AppSettings settings) async {
    // Cancel all previous schedules to avoid duplicates
    await _notifications.cancelAll();
    
    for (var entry in settings.alarms.entries) {
      if (entry.value.enabled) {
        await scheduleAlarm(
          id: entry.key.hashCode,
          title: 'Lembrete de Ponto',
          body: 'Está na hora da sua batida de ${entry.key}!',
          time: entry.value.time,
        );
      }
    }
  }

  static Future<void> scheduleAlarm({
    required int id,
    required String title,
    required String body,
    required String time, // HH:mm
  }) async {
    final parts = time.split(':');
    final hour = int.parse(parts[0]);
    final minute = int.parse(parts[1]);

    final now = DateTime.now();
    var scheduledDate = DateTime(now.year, now.month, now.day, hour, minute);
    
    if (scheduledDate.isBefore(now)) {
      scheduledDate = scheduledDate.add(const Duration(days: 1));
    }

    await _notifications.zonedSchedule(
      id,
      title,
      body,
      tz.TZDateTime.from(scheduledDate, tz.local),
      NotificationDetails(
        android: AndroidNotificationDetails(
          'ponto_alarms_v4', // Versão 4 para forçar novas configurações de canal
          'Alarmes de Ponto',
          channelDescription: 'Alarmes críticos para registro de ponto',
          importance: Importance.max,
          priority: Priority.max,
          fullScreenIntent: true,
          category: AndroidNotificationCategory.alarm,
          audioAttributesUsage: AudioAttributesUsage.alarm,
          playSound: true,
          visibility: NotificationVisibility.public,
          ongoing: true,
          autoCancel: false,
          ticker: 'Alarme de Ponto',
          styleInformation: const BigTextStyleInformation(''),
          additionalFlags: Int32List.fromList([4]), // FLAG_INSISTENT
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  static Future<void> cancelAlarm(int id) async {
    await _notifications.cancel(id);
  }
}
