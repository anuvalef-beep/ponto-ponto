import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../signals/app_signals.dart';
import '../services/database_service.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/ponto_models.dart';
import 'package:signals_flutter/signals_flutter.dart';
import 'package:intl/intl.dart';

class FleetScreen extends StatefulWidget {
  const FleetScreen({super.key});

  @override
  State<FleetScreen> createState() => _FleetScreenState();
}

class _FleetScreenState extends State<FleetScreen> {
  final List<XFile> _damagePhotos = [];
  final ImagePicker _picker = ImagePicker();
  late TextEditingController _prefixController;

  @override
  void initState() {
    super.initState();
    _prefixController = TextEditingController(text: AppSignals.currentCarPrefix.value);
    _loadTodayLog();
    _prefixController.addListener(_onPrefixChanged);
  }

  Future<void> _onPrefixChanged() async {
    AppSignals.currentCarPrefix.value = _prefixController.text;
    if (_prefixController.text.isNotEmpty) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('saved_car_prefix', _prefixController.text);
    }
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

  Future<void> _loadTodayLog() async {
    if (AppSignals.user.value == null) return;
    if (AppSignals.currentDayLog.value != null) return;
    
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

  @override
  void dispose() {
    _prefixController.removeListener(_onPrefixChanged);
    _prefixController.dispose();
    super.dispose();
  }

  bool _isUploading = false;

  Future<void> _takePhoto() async {
    final XFile? photo = await _picker.pickImage(source: ImageSource.camera, imageQuality: 50);
    if (photo != null) {
      setState(() {
        _damagePhotos.add(photo);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Vistoria da Frota', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Identificação do Veículo',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            GlassContainer(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    const Icon(LucideIcons.car, color: AppTheme.primaryColor),
                    const SizedBox(width: 16),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 150,
                          child: TextField(
                            controller: _prefixController,
                            decoration: const InputDecoration(
                              labelText: 'Prefixo',
                              isDense: true,
                              border: InputBorder.none,
                            ),
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                            onChanged: (val) {
              // Já tratado pelo listener no initState
            },
                          ),
                        ),
                        Text('Identifique o veículo atual', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                      ],
                    ),
                    const Spacer(),
                    const Icon(LucideIcons.edit3, size: 16, color: Colors.grey),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 32),
            
            const Text(
              'Registro de Avarias',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            
            Watch((context) {
              final networkPhotos = AppSignals.currentDayLog.value?.damagePhotos ?? [];
              final totalPhotos = networkPhotos.length + _damagePhotos.length;
              
              if (totalPhotos == 0) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 40.0),
                    child: Column(
                      children: [
                        Icon(LucideIcons.cameraOff, size: 48, color: Colors.grey.shade700),
                        const SizedBox(height: 16),
                        Text('Nenhuma avaria registrada.', style: TextStyle(color: Colors.grey.shade600)),
                      ],
                    ),
                  ),
                );
              }

              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: totalPhotos,
                itemBuilder: (context, index) {
                  final isNetwork = index < networkPhotos.length;
                  
                  return Stack(
                    fit: StackFit.expand,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: isNetwork
                            ? Image.network(
                                networkPhotos[index],
                                fit: BoxFit.cover,
                                loadingBuilder: (context, child, progress) {
                                  if (progress == null) return child;
                                  return Container(color: Colors.grey.shade800, child: const Center(child: CircularProgressIndicator()));
                                },
                                errorBuilder: (context, error, stackTrace) => Container(
                                  color: Colors.red.withOpacity(0.1),
                                  child: const Icon(LucideIcons.imageOff, color: Colors.red),
                                ),
                              )
                            : Image.file(File(_damagePhotos[index - networkPhotos.length].path), fit: BoxFit.cover),
                      ),
                      Positioned(
                        top: 4,
                        right: 4,
                        child: GestureDetector(
                          onTap: () async {
                            if (isNetwork) {
                              final log = AppSignals.currentDayLog.value;
                              if (log != null && AppSignals.user.value != null) {
                                final updatedPhotos = log.damagePhotos.where((p) => p != networkPhotos[index]).toList();
                                final newLog = DayLog(
                                  date: log.date,
                                  carPrefix: log.carPrefix,
                                  punches: log.punches,
                                  damagePhotos: updatedPhotos,
                                  isDayOff: log.isDayOff,
                                );
                                AppSignals.currentDayLog.value = newLog;
                                final db = DatabaseService(uid: AppSignals.user.value!.uid);
                                await db.saveDayLog(newLog);
                              }
                            } else {
                              setState(() {
                                _damagePhotos.removeAt(index - networkPhotos.length);
                              });
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: const BoxDecoration(
                              color: Colors.redAccent,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(LucideIcons.x, size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              );
            }),
            
            const SizedBox(height: 24),
            
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _takePhoto,
                icon: const Icon(LucideIcons.camera),
                label: const Text('ADICIONAR FOTO DE AVARIA'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isUploading ? null : () async {
          if (AppSignals.user.value == null) return;
          
          setState(() => _isUploading = true);
          
          try {
            final db = DatabaseService(uid: AppSignals.user.value!.uid);
            final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
            
            // Upload images to Storage
            final List<File> files = _damagePhotos.map((x) => File(x.path)).toList();
            final urls = await db.uploadImages(files, 'damages/$today');
            
            // Get current log or create new one
            final currentLog = AppSignals.currentDayLog.value;
            final logDate = currentLog?.date ?? DateFormat('yyyy-MM-dd').format(DateTime.now());
            final updatedPhotos = <String>[
              ...(currentLog?.damagePhotos ?? []),
              ...urls,
            ];
            
            final newLog = DayLog(
              date: logDate,
              carPrefix: AppSignals.currentCarPrefix.value,
              punches: currentLog?.punches ?? [],
              damagePhotos: updatedPhotos,
            );

            await db.saveDayLog(newLog);
            AppSignals.currentDayLog.value = newLog;

            if (mounted) {
              setState(() {
                _damagePhotos.clear();
              });
              _showToast('Vistoria e fotos salvas com sucesso!');
            }
          } catch (e) {
            _showToast('Erro ao salvar vistoria: $e', isError: true);
          } finally {
            if (mounted) setState(() => _isUploading = false);
          }
        },
        label: Text(_isUploading ? 'Enviando...' : 'Finalizar Vistoria'),
        icon: _isUploading 
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : const Icon(LucideIcons.save),
        backgroundColor: AppTheme.accentColor,
      ),
    );
  }
}
