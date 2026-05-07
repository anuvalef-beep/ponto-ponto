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
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'permissions_screen.dart';

class ClockScreen extends StatefulWidget {
  const ClockScreen({super.key});

  @override
  State<ClockScreen> createState() => _ClockScreenState();
}

class _ClockScreenState extends State<ClockScreen> {
  late Timer _timer;
  DateTime _now = DateTime.now();
  bool _hasPendingPermissions = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _now = DateTime.now();
        });
      }
    });
    _loadTodayLog();
    _checkPermissions();
  }

  Future<void> _checkPermissions() async {
    final status = await Permission.notification.status;
    final alarmStatus = await Permission.scheduleExactAlarm.status;
    final batteryStatus = await Permission.ignoreBatteryOptimizations.status;
    
    if (mounted) {
      setState(() {
        _hasPendingPermissions = !status.isGranted || !alarmStatus.isGranted || !batteryStatus.isGranted;
      });
    }
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
      id: Uuid().v4(),
      type: type,
      timestamp: DateTime.now(),
      carPrefix: AppSignals.currentCarPrefix.value,
    );

    final currentLog = AppSignals.currentDayLog.value;
    final updatedPunches = currentLog != null 
        ? [...currentLog.punches, punch]
        : [punch];
    
    final newLog = DayLog(
      date: today,
      carPrefix: AppSignals.currentCarPrefix.value,
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

  Future<void> _editPunch(PunchType type) async {
    final log = AppSignals.currentDayLog.value;
    if (log == null || AppSignals.user.value == null) return;
    
    final punch = log.punches.firstWhere((p) => p.type == type);
    final initialTime = TimeOfDay.fromDateTime(punch.timestamp);
    
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: initialTime,
      helpText: 'Corrigir horário de ${type.name.toUpperCase()}',
    );
    
    if (picked != null) {
      final now = DateTime.now();
      final newTimestamp = DateTime(now.year, now.month, now.day, picked.hour, picked.minute);
      
      final updatedPunches = log.punches.map((p) {
        return p.type == type 
          ? Punch(id: p.id, type: p.type, timestamp: newTimestamp, carPrefix: p.carPrefix)
          : p;
      }).toList();
      
      final newLog = DayLog(
        date: log.date,
        carPrefix: log.carPrefix,
        punches: updatedPunches,
      );

      final db = DatabaseService(uid: AppSignals.user.value!.uid);
      await db.saveDayLog(newLog);
      AppSignals.currentDayLog.value = newLog;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Horário corrigido com sucesso!')),
      );
    }
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
                  CircleAvatar(
                    radius: 24,
                    backgroundImage: AppSignals.user.value?.photoURL != null ? NetworkImage(AppSignals.user.value!.photoURL!) : null,
                    child: AppSignals.user.value?.photoURL == null ? const Icon(LucideIcons.user, color: Colors.white) : null,
                  ),
                ],
              ),
              
              const SizedBox(height: 16),

              if (_hasPendingPermissions)
                GestureDetector(
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => const PermissionsScreen()),
                    );
                    _checkPermissions();
                  },
                  child: GlassContainer(
                    color: Colors.amber.withOpacity(0.1),
                    child: const Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Row(
                        children: [
                          Icon(LucideIcons.alertTriangle, color: Colors.amber),
                          SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Configuração Pendente',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                ),
                                Text(
                                  'Clique para ativar os alarmes corretamente.',
                                  style: TextStyle(color: Colors.grey, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                          Icon(LucideIcons.chevronRight, color: Colors.grey, size: 20),
                        ],
                      ),
                    ),
                  ),
                ).animate().shake(),

              const Spacer(),
              
              // Digital Clock
              Text(
                DateFormat('HH:mm:ss').format(_now),
                style: const TextStyle(
                  fontSize: 80,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -4,
                  fontFamily: 'RobotoMono',
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
                      Colors.orangeAccent,
                      punches.any((p) => p.type == PunchType.pausa),
                    ),
                    _buildPunchButton(
                      'RETORNO', 
                      PunchType.retorno, 
                      LucideIcons.rotateCcw, 
                      Colors.blueAccent,
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
              
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPunchButton(String label, PunchType type, IconData icon, Color color, bool isDone) {
    return GestureDetector(
      onTap: () {
        if (isDone) {
          _editPunch(type);
        } else {
          _handlePunch(type);
        }
      },
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
