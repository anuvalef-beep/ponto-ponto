import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/foundation.dart';
import './database_service.dart';
import '../signals/app_signals.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;

  AuthService._internal() {
    debugPrint('AuthService: Inicializando...');
    
    // Captura estado inicial imediatamente
    final currentUser = _auth.currentUser;
    if (currentUser != null) {
      debugPrint('AuthService: Usuário já logado: ${currentUser.uid}');
      _handleUserChange(currentUser);
    }

    _auth.authStateChanges().listen((user) {
      debugPrint('AuthService: authStateChanges: ${user?.uid ?? "null"}');
      _handleUserChange(user);
    });
  }

  Future<void> _handleUserChange(User? user) async {
    AppSignals.user.value = user;
    if (user != null) {
      try {
        final db = DatabaseService(uid: user.uid);
        final settings = await db.getSettings();
        if (settings != null) {
          AppSignals.settings.value = settings;
        }
      } catch (e) {
        debugPrint('AuthService: Erro ao carregar settings: $e');
      }
    }
  }

  Future<UserCredential?> signInWithGoogle() async {
    try {
      debugPrint('AuthService: Iniciando Google Sign In...');
      AppSignals.isLoading.value = true;
      
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        debugPrint('AuthService: Google Sign In cancelado pelo usuário');
        return null;
      }

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      final AuthCredential credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      debugPrint('AuthService: Autenticando com Firebase...');
      final userCredential = await _auth.signInWithCredential(credential);
      debugPrint('AuthService: Autenticação Firebase sucesso: ${userCredential.user?.uid}');
      return userCredential;
    } catch (e) {
      debugPrint('AuthService: Erro no Google Sign In: $e');
      AppSignals.message.value = 'Erro ao entrar com Google: $e';
      return null;
    } finally {
      AppSignals.isLoading.value = false;
    }
  }

  Future<void> signOut() async {
    debugPrint('AuthService: Fazendo logout...');
    await _googleSignIn.signOut();
    await _auth.signOut();
  }
}
