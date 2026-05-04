import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:signals_flutter/signals_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/ponto_models.dart';
import '../signals/app_signals.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../services/database_service.dart';

class ClockScreen extends StatefulWidget {
  const ClockScreen({super.key});

  @override
  State<ClockScreen> createState() => _ClockScreenState();
}

class _ClockScreenState extends State<ClockScreen> {
  late Timer _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _now = DateTime.now();
      });
    });
    _loadTodayLog();
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  Future<void> _loadTodayLog() async {
    if (AppSignals.user.value == null) return;
    final db = DatabaseService(uid: AppSignals.user.value!.uid);
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final log = await db.getDayLog(today);
    AppSignals.currentDayLog.value = log;
  }

  Future<void> _handlePunch(PunchType type) async {
    if (AppSignals.user.value == null) return;
    
    final db = DatabaseService(uid: AppSignals.user.value!.uid);
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    
    final punch = Punch(
      id: const Uuid().v4(),
      type: type,
      timestamp: DateTime.now(),
      carPrefix: 'FROTA-01', // TODO: Get from settings
    );

    final currentLog = AppSignals.currentDayLog.value;
    final updatedPunches = currentLog != null 
        ? List<Punch>.from(currentLog.punches)..add(punch)
        : [punch];
    
    final newLog = DayLog(
      date: today,
      carPrefix: 'FROTA-01',
      punches: updatedPunches,
    );

    await db.saveDayLog(newLog);
    AppSignals.currentDayLog.value = newLog;
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${type.name.toUpperCase()} registrado com sucesso!'),
        backgroundColor: AppTheme.accentColor,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        DateFormat('EEEE, d MMMM', 'pt_BR').format(_now),
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 16),
                      ),
                      Text(
                        'Bom dia, ${AppSignals.user.value?.displayName?.split(' ').first ?? 'Motorista'}!',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const CircleAvatar(
                    radius: 24,
                    backgroundColor: AppTheme.primaryColor,
                    child: Icon(LucideIcons.user, color: Colors.white),
                  ),
                ],
              ),
              
              const Spacer(),
              
              // Digital Clock
              Text(
                DateFormat('HH:mm:ss').format(_now),
                style: const TextStyle(
                  fontSize: 80,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -4,
                  fontFamily: 'RobotoMono', // Digital feel
                ),
              ),
              
              const Spacer(),
              
              // Punch Buttons Grid
              Watch((context) {
                final log = AppSignals.currentDayLog.value;
                final punches = log?.punches ?? [];
                
                return GridView.count(
                  shrinkWrap: true,
                  crossAxisCount: 2,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  children: [
                    _buildPunchButton(
                      'ENTRADA', 
                      PunchType.entrada, 
                      LucideIcons.play, 
                      AppTheme.primaryColor,
                      punches.any((p) => p.type == PunchType.entrada),
                    ),
                    _buildPunchButton(
                      'PAUSA', 
                      PunchType.pausa, 
                      LucideIcons.pause, 
                      Colors.orange,
                      punches.any((p) => p.type == PunchType.pausa),
                    ),
                    _buildPunchButton(
                      'RETORNO', 
                      PunchType.retorno, 
                      LucideIcons.rotateCcw, 
                      Colors.cyan,
                      punches.any((p) => p.type == PunchType.retorno),
                    ),
                    _buildPunchButton(
                      'FIM', 
                      PunchType.fim, 
                      LucideIcons.square, 
                      Colors.redAccent,
                      punches.any((p) => p.type == PunchType.fim),
                    ),
                  ],
                );
              }),
              
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPunchButton(String label, PunchType type, IconData icon, Color color, bool isDone) {
    return GestureDetector(
      onTap: isDone ? null : () => _handlePunch(type),
      child: GlassContainer(
        color: isDone ? color.withOpacity(0.1) : color.withOpacity(0.1),
        border: Border.all(
          color: isDone ? color : color.withOpacity(0.3),
          width: 2,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isDone ? LucideIcons.checkCircle2 : icon,
              size: 40,
              color: isDone ? color : color.withOpacity(0.8),
            ),
            const SizedBox(height: 12),
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                letterSpacing: 1,
                color: isDone ? color : color.withOpacity(0.8),
              ),
            ),
            if (isDone) ...[
              const SizedBox(height: 4),
              Text(
                DateFormat('HH:mm').format(
                  AppSignals.currentDayLog.value!.punches.firstWhere((p) => p.type == type).timestamp
                ),
                style: TextStyle(fontSize: 12, color: color),
              ),
            ]
          ],
        ),
      ),
    );
  }
}
