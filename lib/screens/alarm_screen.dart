import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../signals/app_signals.dart';
import 'package:alarm/alarm.dart';

class AlarmScreen extends StatelessWidget {
  final String alarmType;
  
  const AlarmScreen({super.key, required this.alarmType});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppTheme.primaryColor.withOpacity(0.8),
              Colors.black,
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              
              const Icon(
                LucideIcons.alarmClock,
                size: 100,
                color: Colors.white,
              ).animate(onPlay: (controller) => controller.repeat())
               .shake(duration: 1000.ms, hz: 4)
               .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1)),
              
              const SizedBox(height: 40),
              
              Text(
                'HORA DO PONTO!',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.black,
                  color: Colors.white,
                  letterSpacing: 2,
                  shadows: [
                    Shadow(color: Colors.black.withOpacity(0.5), offset: const Offset(0, 4), blurRadius: 10),
                  ],
                ),
              ).animate().fadeIn(duration: 600.ms).slideY(begin: 0.3),
              
              const SizedBox(height: 16),
              
              Text(
                'Está na hora da sua batida de\n${alarmType.toUpperCase()}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 18,
                  color: Colors.white70,
                ),
              ).animate().fadeIn(delay: 300.ms),
              
              const Spacer(),
              
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: 70,
                      child: ElevatedButton(
                        onPressed: () async {
                          await Alarm.stopAll();
                          Navigator.pop(context);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                          elevation: 10,
                        ),
                        child: const Text(
                          'VOU BATER AGORA',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ).animate().fadeIn(delay: 600.ms).scale(),
                    
                    const SizedBox(height: 20),
                    
                    TextButton(
                      onPressed: () async {
                        await Alarm.stopAll();
                        Navigator.pop(context);
                      },
                      child: Text(
                        'DISPENSAR',
                        style: TextStyle(color: Colors.white.withOpacity(0.6), fontWeight: FontWeight.bold),
                      ),
                    ).animate().fadeIn(delay: 800.ms),
                  ],
                ),
              ),
              
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
