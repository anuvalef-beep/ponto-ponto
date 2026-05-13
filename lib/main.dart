import 'package:flutter/material.dart';
import 'package:signals_flutter/signals_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';
import 'screens/alarm_screen.dart';
import 'screens/onboarding_screen.dart';
import 'signals/app_signals.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';
import 'package:alarm/alarm.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  try {
    WidgetsFlutterBinding.ensureInitialized();
    
    // Initialize Firebase first
    await Firebase.initializeApp();
    
    await initializeDateFormatting('pt_BR', null);
    await NotificationService.init();
    await Alarm.init();
    
    // Initialize AuthService
    AuthService();
    
    runApp(const MyApp());
  } catch (e) {
    debugPrint('Erro na inicializacao: $e');
    // Fallback app if something critical fails
    runApp(MaterialApp(home: Scaffold(body: Center(child: Text('Erro ao iniciar: $e')))));
  }
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    _setupNotificationListener();
  }

  void _setupNotificationListener() {
    // Check if app was opened from a notification
    FlutterLocalNotificationsPlugin().getNotificationAppLaunchDetails().then((details) {
      if (details != null && details.didNotificationLaunchApp && details.notificationResponse?.payload != null) {
        _handleNotificationPayload(details.notificationResponse!.payload!);
      }
    });

    // Listen for signal changes
    effect(() {
      final payload = AppSignals.incomingNotification.value;
      if (payload != null) {
        _handleNotificationPayload(payload);
        // Reset signal after handling
        Future.microtask(() => AppSignals.incomingNotification.value = null);
      }
    });

    // Listen for real alarm ringing (when app is open)
    Alarm.ringStream.stream.listen((alarmSettings) {
      _handleAlarmRing(alarmSettings);
    });

    // Check for alarms that are already ringing
    Alarm.getAlarms().then((alarms) async {
      for (var alarm in alarms) {
        if (await Alarm.isRinging(alarm.id)) {
          _handleAlarmRing(alarm);
          break;
        }
      }
    });
  }

  void _handleAlarmRing(AlarmSettings alarmSettings) {
    String type = "Ponto";
    final body = alarmSettings.notificationSettings.body.toUpperCase();
    
    if (body.contains("ENTRADA")) type = "entrada";
    else if (body.contains("PAUSA")) type = "pausa";
    else if (body.contains("RETORNO")) type = "retorno";
    else if (body.contains("FIM")) type = "fim";
    else if (alarmSettings.notificationSettings.title.contains("Teste")) type = "Teste";
    
    Future.delayed(const Duration(milliseconds: 500), () {
      navigatorKey.currentState?.push(
        MaterialPageRoute(builder: (context) => AlarmScreen(alarmType: type))
      );
    });
  }

  void _handleNotificationPayload(String payload) {
    if (payload.startsWith('alarm_') || payload == 'test') {
      String type = payload == 'test' ? 'Teste' : payload.split('_').last;
      
      // Wait a bit for the app to be ready and navigated to main screen
      Future.delayed(const Duration(milliseconds: 500), () {
        navigatorKey.currentState?.push(
          MaterialPageRoute(builder: (context) => AlarmScreen(alarmType: type))
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ponto & Frota',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('pt', 'BR'),
      ],
      home: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(
                child: CircularProgressIndicator(color: AppTheme.primaryColor),
              ),
            );
          }
          
          final user = snapshot.data;
          debugPrint('MyApp: Rebuilding Home (user: ${user?.uid})');

          return user != null ? const RootScreen() : const LoginScreen();
        },
      ),
    );
  }
}

class RootScreen extends StatefulWidget {
  const RootScreen({super.key});

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> {
  bool? _hasSeenOnboarding;

  @override
  void initState() {
    super.initState();
    _checkOnboarding();
  }

  Future<void> _checkOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _hasSeenOnboarding = prefs.getBool('has_seen_onboarding') ?? false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hasSeenOnboarding == null) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: AppTheme.primaryColor),
        ),
      );
    }
    return _hasSeenOnboarding! ? const MainScreen() : const OnboardingScreen();
  }
}
