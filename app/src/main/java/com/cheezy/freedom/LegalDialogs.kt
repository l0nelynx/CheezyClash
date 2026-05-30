package com.cheezy.freedom

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PrivacyPolicyDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Политика конфиденциальности") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                LegalSection("1. Собираемые данные")
                LegalItem("1.1. Обязательные данные:", "Email, идентификатор устройства (HWID), данные об оплате.")
                LegalItem("1.2. Технические данные:", "Время подключения, модель устройства, версия ОС, объём трафика.")

                LegalSection("2. Запрет на сбор")
                Text("2.1. Сервис никогда не сохраняет историю посещённых сайтов, IP-адреса пользователей и передаваемый через Приложение контент.")

                LegalSection("3. Использование данных")
                Text("3.1. Данные используются исключительно для активации доступа, технической поддержки и уведомлений Приложения.")

                LegalSection("4. Защита данных")
                Text("4.1. Все данные хранятся на зашифрованных серверах в Швейцарии и Румынии.")
                Text("4.2. Ключи доступа генерируются Сервисом автоматически и удаляются при отмене подписки.")

                LegalSection("5. Передача третьим лицам")
                Text("5.1. Данные передаются только платёжным системам или по официальному запросу уполномоченных органов РФ.")

                LegalSection("6. Срок хранения")
                Text("6.1. Данные удаляются через 30 дней после прекращения подписки или по запросу пользователя в адрес Сервиса.")

                LegalSection("7. Права пользователя")
                Text("Вы имеете право на доступ, исправление и удаление ваших данных, обратившись в поддержку Сервиса.")
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Закрыть") }
        }
    )
}

@Composable
fun TermsOfServiceDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Пользовательское соглашение") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                LegalSection("1. Предмет соглашения")
                Text("1.1. Сервис предоставляет доступ к VPN-серверам для шифрования трафика через Приложение.")
                Text("1.2. Установка и использование Приложения означают акцепт настоящей оферты.")

                LegalSection("2. Условия использования")
                LegalItem("2.1. Пользователь обязуется:", "Не нарушать законы РФ, не распространять вредоносное ПО, не совершать сетевых атак с использованием Сервиса.")
                LegalItem("2.2. Запрещено:", "Передавать учётную запись Приложения третьим лицам, препятствовать работе Сервиса.")

                LegalSection("3. Оплата и возврат")
                Text("3.1. Оплата тарифов осуществляется в Приложении через подключённые платёжные системы.")
                Text("3.2. Возврат средств возможен только при технической невозможности предоставления услуги Сервисом.")

                LegalSection("4. Ответственность")
                Text("4.1. Сервис не гарантирует 100% доступность.")
                Text("4.2. Администрация Сервиса не несёт ответственности за действия пользователей или блокировки ресурсов.")

                LegalSection("5. Расторжение")
                Text("5.1. Блокировка учётной записи возможна при нарушении правил Сервиса.")

                LegalSection("6. Контакты")
                Text("Поддержка Сервиса доступна по контактам, указанным в Приложении.")
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Закрыть") }
        }
    )
}

@Composable
private fun LegalSection(title: String) {
    Spacer(modifier = Modifier.height(12.dp))
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun LegalItem(label: String, content: String) {
    Text(
        text = label,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 4.dp)
    )
    Text(
        text = content,
        style = MaterialTheme.typography.bodySmall
    )
}
