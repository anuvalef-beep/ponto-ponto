import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../signals/app_signals.dart';
import '../services/database_service.dart';
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
  }

  @override
  void dispose() {
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
                            onChanged: (val) => AppSignals.currentCarPrefix.value = val,
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
            
            if (_damagePhotos.isEmpty)
              Center(
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
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: _damagePhotos.length,
                itemBuilder: (context, index) {
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.file(File(_damagePhotos[index].path), fit: BoxFit.cover),
                  );
                },
              ),
            
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
            final newLog = DayLog(
              date: today,
              carPrefix: AppSignals.currentCarPrefix.value,
              punches: currentLog?.punches ?? [],
              damagePhotos: urls,
            );

            await db.saveDayLog(newLog);
            AppSignals.currentDayLog.value = newLog;

            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Vistoria e fotos salvas com sucesso!')),
              );
            }
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
