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
    } catch (e) {
      debugPrint('Erro ao definir timezone: $e');
    }

    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
        
    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
    );

    await _notifications.initialize(
      settings: initializationSettings,
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



    final alarmSettings = AlarmSettings(
      id: 999,
      dateTime: scheduledDate,
      assetAudioPath: 'assets/alarm.mp3',
      loopAudio: true,
      vibrate: true,
      volumeSettings: VolumeSettings.fixed(volume: 0.8),
      notificationSettings: NotificationSettings(
        title: 'Teste de Alarme',
        body: 'O despertador real está funcionando!',
      ),
      warningNotificationOnKill: true,
    );
    
    await Alarm.set(alarmSettings: alarmSettings);
  }

  static Future<void> scheduleAlarm({
    required int id,
    required String type,
    required String title,
    required String body,
    required String timeStr, // Recebe string HH:mm
    required List<int> activeDays, // 1 = Seg, 7 = Dom
  }) async {
    final parts = timeStr.split(':');
    if (parts.length != 2) return;
    
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);

    if (hour == null || minute == null) return;

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

    if (activeDays.isNotEmpty) {
      while (!activeDays.contains(scheduledDate.weekday)) {
        scheduledDate = scheduledDate.add(const Duration(days: 1));
      }
    } else {
      return; // Se nenhum dia foi selecionado, não agenda nada
    }

    // REAL ALARM MIGRATION:
    // We also schedule a real alarm that plays sound until stopped.
    final alarmSettings = AlarmSettings(
      id: id.abs(),
      dateTime: scheduledDate,
      assetAudioPath: 'assets/alarm.mp3',
      loopAudio: true,
      vibrate: true,
      androidFullScreenIntent: true, // Garante que a tela ligue no Android
      volumeSettings: VolumeSettings.fade(
        volume: 0.8,
        fadeDuration: const Duration(seconds: 3),
      ),
      notificationSettings: NotificationSettings(
        title: title,
        body: body,
        stopButton: 'PARAR', // Botão para parar direto na notificação
      ),
      warningNotificationOnKill: true,
    );
    
    await Alarm.set(alarmSettings: alarmSettings);
  }

  static Future<void> cancelAlarm(int id) async {
    await _notifications.cancel(id: id.abs());
    await Alarm.stop(id.abs());
  }

  static Future<void> rescheduleAllAlarms(models.AppSettings settings) async {
    await _notifications.cancelAll();
    await Alarm.stopAll(); // Importante: limpa alarmes antigos do pacote Alarm
    
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
          activeDays: alarm.activeDays,
        );
      }
    }
  }
}
