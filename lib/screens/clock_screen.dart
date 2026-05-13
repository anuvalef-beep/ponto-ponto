import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:signals_flutter/signals_flutter.dart';
import 'package:uuid/uuid.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/ponto_models.dart';
import '../signals/app_signals.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../services/database_service.dart';
import '../utils/ponto_utils.dart';
import 'package:flutter_animate/flutter_animate.dart';

class ClockScreen extends StatefulWidget {
  const ClockScreen({super.key});

  @override
  State<ClockScreen> createState() => _ClockScreenState();
}

class _ClockScreenState extends State<ClockScreen> {
  late Timer _timer;
  DateTime _now = DateTime.now();

  late TextEditingController _prefixController;
  final ImagePicker _picker = ImagePicker();
  bool _isUploadingPhoto = false;

  String _getGreeting() {
    final hour = _now.hour;
    if (hour < 5) return 'Boa madrugada';
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  void _showToast(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(isError ? LucideIcons.alertCircle : LucideIcons.checkCircle2, color: Colors.white),
            const SizedBox(width: 12),
            Expanded(child: Text(message, style: const TextStyle(fontWeight: FontWeight.bold))),
          ],
        ),
        backgroundColor: isError ? Colors.redAccent : AppTheme.accentColor,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.all(16),
        elevation: 0,
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _prefixController = TextEditingController(text: AppSignals.currentCarPrefix.value);
    _prefixController.addListener(_onPrefixChanged);

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
    _prefixController.removeListener(_onPrefixChanged);
    _prefixController.dispose();
    super.dispose();
  }

  Future<void> _onPrefixChanged() async {
    AppSignals.currentCarPrefix.value = _prefixController.text;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('saved_car_prefix', _prefixController.text);
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
      if (mounted) {
        _prefixController.text = log.carPrefix;
      }
    } else {
      final prefs = await SharedPreferences.getInstance();
      final savedPrefix = prefs.getString('saved_car_prefix');
      if (savedPrefix != null && savedPrefix.isNotEmpty) {
        AppSignals.currentCarPrefix.value = savedPrefix;
        if (mounted) {
          _prefixController.text = savedPrefix;
        }
      }
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
      isDayOff: currentLog?.isDayOff ?? false,
    );

    await db.saveDayLog(newLog);
    AppSignals.currentDayLog.value = newLog;
    
    _showToast('${type.name.toUpperCase()} registrado com sucesso!');
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
        isDayOff: log.isDayOff,
      );

      final db = DatabaseService(uid: AppSignals.user.value!.uid);
      await db.saveDayLog(newLog);
      AppSignals.currentDayLog.value = newLog;

      _showToast('Horário corrigido com sucesso!');
    }
  }

  Future<void> _takePhoto() async {
    if (AppSignals.user.value == null) return;
    
    final XFile? photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 50);
    if (photo == null) return;

    setState(() => _isUploadingPhoto = true);
    _showToast('Enviando foto de avaria...');

    try {
      final db = DatabaseService(uid: AppSignals.user.value!.uid);
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      
      final urls = await db.uploadImages([File(photo.path)], 'damages/$today');
      
      final currentLog = AppSignals.currentDayLog.value;
      final logDate = currentLog?.date ?? today;
      final updatedPhotos = <String>[
        ...(currentLog?.damagePhotos ?? []),
        ...urls,
      ];
      
      final newLog = DayLog(
        date: logDate,
        carPrefix: AppSignals.currentCarPrefix.value,
        punches: currentLog?.punches ?? [],
        damagePhotos: updatedPhotos,
        isDayOff: currentLog?.isDayOff ?? false,
      );

      await db.saveDayLog(newLog);
      AppSignals.currentDayLog.value = newLog;

      _showToast('Foto de avaria salva no histórico!');
    } catch (e) {
      _showToast('Erro ao salvar foto: $e', isError: true);
    } finally {
      if (mounted) setState(() => _isUploadingPhoto = false);
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
                        '${_getGreeting()}, ${AppSignals.user.value?.displayName?.split(' ').first ?? 'Motorista'}!',
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

              // Prefix Input
              GlassContainer(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.car, color: AppTheme.primaryColor),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextField(
                          controller: _prefixController,
                          decoration: const InputDecoration(
                            labelText: 'Prefixo do Veículo',
                            border: InputBorder.none,
                            isDense: true,
                          ),
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

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
              
              Watch((context) {
                final log = AppSignals.currentDayLog.value;
                if (log == null) return const SizedBox();
                
                final workedMins = PontoUtils.calculateWorkedMinutesSoFar(log, _now);
                final limitMins = 7 * 60 + 20; // 440 mins
                double progress = workedMins / limitMins;
                if (progress > 1.0) progress = 1.0;
                
                final hours = (workedMins / 60).floor();
                final mins = workedMins % 60;
                
                return Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Progresso do Turno', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
                        Text('${hours.toString().padLeft(2, '0')}:${mins.toString().padLeft(2, '0')} / 07:20', 
                             style: TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.bold, fontSize: 12)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: progress,
                        minHeight: 8,
                        backgroundColor: Colors.white.withOpacity(0.1),
                        valueColor: AlwaysStoppedAnimation<Color>(
                          progress == 1.0 ? Colors.amber : AppTheme.primaryColor,
                        ),
                      ),
                    ),
                  ],
                );
              }),

              const Spacer(),
              
              // Punch Buttons Grid
              Watch((context) {
                final log = AppSignals.currentDayLog.value;
                final punches = log?.punches ?? [];
                
                final hasEntrada = punches.any((p) => p.type == PunchType.entrada);
                final hasPausa = punches.any((p) => p.type == PunchType.pausa);
                final hasRetorno = punches.any((p) => p.type == PunchType.retorno);
                final hasFim = punches.any((p) => p.type == PunchType.fim);
                
                final isNextEntrada = !hasEntrada;
                final isNextPausa = hasEntrada && !hasPausa;
                final isNextRetorno = hasPausa && !hasRetorno;
                final isNextFim = hasRetorno && !hasFim;

                return GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  children: [
                    _buildPunchButton(
                      'ENTRADA', 
                      PunchType.entrada, 
                      LucideIcons.play, 
                      AppTheme.primaryColor,
                      hasEntrada,
                      isNextEntrada,
                    ),
                    _buildPunchButton(
                      'PAUSA', 
                      PunchType.pausa, 
                      LucideIcons.pause, 
                      Colors.orangeAccent,
                      hasPausa,
                      isNextPausa,
                    ),
                    _buildPunchButton(
                      'RETORNO', 
                      PunchType.retorno, 
                      LucideIcons.rotateCcw, 
                      Colors.blueAccent,
                      hasRetorno,
                      isNextRetorno,
                    ),
                    _buildPunchButton(
                      'FIM', 
                      PunchType.fim, 
                      LucideIcons.square, 
                      Colors.redAccent,
                      hasFim,
                      isNextFim,
                    ),
                  ],
                );
              }),
              
              const SizedBox(height: 16),
              
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _isUploadingPhoto ? null : _takePhoto,
                  icon: _isUploadingPhoto 
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(LucideIcons.camera),
                  label: Text(_isUploadingPhoto ? 'ENVIANDO...' : 'ADICIONAR FOTO DE AVARIA'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blueAccent.withOpacity(0.8),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),

            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPunchButton(String label, PunchType type, IconData icon, Color color, bool isDone, bool isNext) {
    Widget button = GlassContainer(
      color: isDone ? color.withOpacity(0.1) : color.withOpacity(0.05),
      border: Border.all(
        color: isDone ? color : (isNext ? color : color.withOpacity(0.2)),
        width: isNext ? 3 : 2,
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
            if (isDone && AppSignals.currentDayLog.value != null) ...[
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
      );

    if (isNext) {
      button = button.animate(onPlay: (controller) => controller.repeat(reverse: true))
                     .scaleXY(end: 1.05, duration: 1000.ms)
                     .shimmer(duration: 2000.ms, color: color.withOpacity(0.3));
    }

    return GestureDetector(
      onTap: () {
        if (isDone) {
          _editPunch(type);
        } else {
          _handlePunch(type);
        }
      },
      child: button,
    );
  }
}
