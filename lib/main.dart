import 'package:flutter/material.dart';
import 'package:signals_flutter/signals_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:firebase_core/firebase_core.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';
import 'signals/app_signals.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';

void main() async {
  try {
    WidgetsFlutterBinding.ensureInitialized();
    
    // Initialize Firebase first
    await Firebase.initializeApp();
    
    await initializeDateFormatting('pt_BR', null);
    await NotificationService.init();
    
    // Initialize AuthService
    AuthService();
    
    runApp(const MyApp());
  } catch (e) {
    debugPrint('Erro na inicializacao: $e');
    // Fallback app if something critical fails
    runApp(MaterialApp(home: Scaffold(body: Center(child: Text('Erro ao iniciar: $e')))));
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ponto & Frota',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      home: Watch((context) {
        if (AppSignals.isLoading.value) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return AppSignals.isAuthenticated.value 
            ? const MainScreen() 
            : const LoginScreen();
      }),
    );
  }
}
