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
import 'package:flutter_animate/flutter_animate.dart';

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
      if (mounted) {
        setState(() {
          _now = DateTime.now();
        });
      }
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
    var log = await db.getDayLog(today);

    if (log == null) {
      final yesterday = DateFormat('yyyy-MM-dd').format(DateTime.now().subtract(const Duration(days: 1)));
      final yesterdayLog = await db.getDayLog(yesterday);
      if (yesterdayLog != null) {
        final hasEntrada = yesterdayLog.punches.any((p) => p.type == PunchType.entrada);
        final hasFim = yesterdayLog.punches.any((p) => p.type == PunchType.fim);
        if (hasEntrada && !hasFim) {
          log = yesterdayLog;
        }
      }
    }

    AppSignals.currentDayLog.value = log;
    if (log != null && log.carPrefix.isNotEmpty) {
      AppSignals.currentCarPrefix.value = log.carPrefix;
    }
  }

  Future<void> _handlePunch(PunchType type) async {
    if (AppSignals.user.value == null) return;
    
    final db = DatabaseService(uid: AppSignals.user.value!.uid);
    final currentLog = AppSignals.currentDayLog.value;
    final logDate = currentLog?.date ?? DateFormat('yyyy-MM-dd').format(DateTime.now());
    
    final punch = Punch(
      id: const Uuid().v4(),
      type: type,
      timestamp: DateTime.now(),
      carPrefix: AppSignals.currentCarPrefix.value,
    );

    final updatedPunches = currentLog != null 
        ? [...currentLog.punches, punch]
        : [punch];
    
    final newLog = DayLog(
      date: logDate,
      carPrefix: AppSignals.currentCarPrefix.value,
      punches: updatedPunches,
      damagePhotos: currentLog?.damagePhotos ?? [],
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
      final newTimestamp = DateTime(
        punch.timestamp.year,
        punch.timestamp.month,
        punch.timestamp.day,
        picked.hour,
        picked.minute,
      );
      
      final updatedPunches = log.punches.map((p) {
        return p.type == type 
          ? Punch(id: p.id, type: p.type, timestamp: newTimestamp, carPrefix: p.carPrefix)
          : p;
      }).toList();
      
      final newLog = DayLog(
        date: log.date,
        carPrefix: log.carPrefix,
        punches: updatedPunches,
        damagePhotos: log.damagePhotos,
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
