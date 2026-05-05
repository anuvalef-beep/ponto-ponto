import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:signals_flutter/signals_flutter.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import '../services/auth_service.dart';
import '../signals/app_signals.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Watch((context) {
        final errorMessage = AppSignals.message.watch(context);
        if (errorMessage != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(errorMessage)),
            );
            AppSignals.message.value = null;
          });
        }
        
        return Stack(
          children: [
          // Background Decoration
          Positioned(
            top: -100,
            left: -50,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
            ).animate().fadeIn(duration: 800.ms).scale(begin: const Offset(0.8, 0.8)),
          ),
          Positioned(
            bottom: -50,
            right: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                color: AppTheme.secondaryColor.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
            ).animate().fadeIn(duration: 1000.ms, delay: 200.ms).scale(begin: const Offset(0.7, 0.7)),
          ),
          
          // Main Content
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: GlassContainer(
                child: Padding(
                  padding: const EdgeInsets.all(32.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Logo
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppTheme.primaryColor, AppTheme.secondaryColor],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.primaryColor.withOpacity(0.3),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            )
                          ],
                        ),
                        child: const Icon(
                          LucideIcons.clock,
                          size: 48,
                          color: Colors.white,
                        ),
                      ).animate().scale(delay: 400.ms, curve: Curves.elasticOut),
                      
                      const SizedBox(height: 32),
                      
                      Text(
                        'Ponto & Frota',
                        style: GoogleFonts.inter(
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1,
                        ),
                      ).animate().fadeIn(delay: 600.ms).slideY(begin: 0.2),
                      
                      const SizedBox(height: 12),
                      
                      Text(
                        'Controle sua jornada e vistorias\nde forma simples e rápida.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.grey.shade500,
                          fontSize: 16,
                          height: 1.5,
                        ),
                      ).animate().fadeIn(delay: 800.ms).slideY(begin: 0.2),
                      
                      const SizedBox(height: 48),
                      
                      // Google Login Button
                      SizedBox(
                        width: double.infinity,
                        child: Watch((context) {
                          final isLoading = AppSignals.isLoading.watch(context);
                          
                          return ElevatedButton(
                            onPressed: isLoading ? null : () {
                              debugPrint('LoginScreen: Botão Google pressionado');
                              AuthService().signInWithGoogle();
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Theme.of(context).brightness == Brightness.dark 
                                  ? Colors.white 
                                  : Colors.black,
                              foregroundColor: Theme.of(context).brightness == Brightness.dark 
                                  ? Colors.black 
                                  : Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 18),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                              elevation: 0,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                isLoading 
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.grey),
                                    )
                                  : const Icon(LucideIcons.logIn, size: 20),
                                const SizedBox(width: 12),
                                Text(
                                  isLoading ? 'Entrando...' : 'Entrar com Google',
                                  style: GoogleFonts.inter(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ).animate().fadeIn(delay: 1000.ms).scale(begin: const Offset(0.9, 0.9)),
                      
                      const SizedBox(height: 24),
                      
                      Text(
                        'Ao entrar, você concorda com nossos Termos de Serviço e Política de Privacidade.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ).animate().fadeIn(delay: 1200.ms),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
