import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz;
import 'package:flutter/material.dart';
import 'dart:typed_data';
import '../models/app_settings.dart';

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
          'ponto_alarms_v6', // Nova versão do canal
          'Alarmes de Ponto',
          channelDescription: 'Canal para lembretes de batida de ponto',
          importance: Importance.max,
          priority: Priority.max,
          fullScreenIntent: true,
          category: AndroidNotificationCategory.alarm,
          audioAttributesUsage: AudioAttributesUsage.alarm,
          playSound: true,
          // Usar som de alarme padrão do sistema
          sound: const RawResourceAndroidNotificationSound('notification'), 
          // Nota: 'notification' é um placeholder, o Android usará o default se configurado no canal
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
    required TimeOfDay time,
  }) async {
    final now = tz.TZDateTime.now(tz.local);
    var scheduledDate = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      time.hour,
      time.minute,
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

  static Future<void> rescheduleAllAlarms(AppSettings settings) async {
    await _notifications.cancelAll();
    
    if (settings.entradaAlarm.enabled) {
      await scheduleAlarm(
        id: 'entrada'.hashCode.abs(),
        title: 'Lembrete de Ponto',
        body: 'Está na hora da sua batida de ENTRADA!',
        time: settings.entradaAlarm.time,
      );
    }
    if (settings.pausaAlarm.enabled) {
      await scheduleAlarm(
        id: 'pausa'.hashCode.abs(),
        title: 'Lembrete de Ponto',
        body: 'Está na hora da sua batida de PAUSA!',
        time: settings.pausaAlarm.time,
      );
    }
    if (settings.retornoAlarm.enabled) {
      await scheduleAlarm(
        id: 'retorno'.hashCode.abs(),
        title: 'Lembrete de Ponto',
        body: 'Está na hora da sua batida de RETORNO!',
        time: settings.retornoAlarm.time,
      );
    }
    if (settings.fimAlarm.enabled) {
      await scheduleAlarm(
        id: 'fim'.hashCode.abs(),
        title: 'Lembrete de Ponto',
        body: 'Está na hora da sua batida de FIM!',
        time: settings.fimAlarm.time,
      );
    }
  }
}
