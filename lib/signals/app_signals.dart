import 'package:signals_flutter/signals_flutter.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/ponto_models.dart';
import '../models/app_settings.dart';

class AppSignals {
  // Auth State
  static final user = signal<User?>(null);
  static final isAuthenticated = computed(() => user.value != null);
  
  // App Data
  static final currentDayLog = signal<DayLog?>(null);
  static final currentCarPrefix = signal<String>('FROTA-01');
  static final incomingNotification = signal<String?>(null);
  static final selectedMonth = signal<DateTime>(DateTime.now());
  static final settings = signal<AppSettings>(AppSettings.defaultSettings());
  
  // Loading State
  static final isLoading = signal<bool>(false);
  
  // Toast/Notification Messages
  static final message = signal<String?>(null);
}
